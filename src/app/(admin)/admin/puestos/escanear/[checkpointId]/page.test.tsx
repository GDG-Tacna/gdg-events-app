import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));
vi.mock("@/app-shell/ServeScreenBound", () => ({ ServeScreenBound: () => null }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const permissions = { requireSection: vi.fn() };
vi.mock("@/app-shell/permissions.server", () => permissions);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { getServePoint: vi.fn(), listServePoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { ServeScreenBound } = await import("@/app-shell/ServeScreenBound");
const { default: AdminCheckpointScanPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

const page = (checkpointId: string) =>
  AdminCheckpointScanPage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof AdminCheckpointScanPage>[0]);

const POINT = { id: "lunch-1", kind: "catering", name: "Almuerzo", description: "Plato fuerte", image: null, servedCount: 42 };

describe("admin puesto scan page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    permissions.requireSection.mockResolvedValue(undefined);
    server.getServePoint.mockResolvedValue({ ok: true, value: POINT });
    server.listServePoints.mockResolvedValue({
      ok: true,
      value: [
        { ...POINT, servedCount: 42 },
        { id: "entrada", kind: "entrance", name: "Entrada principal", description: "", image: null, servedCount: 128 },
      ],
    });
  });

  it("checks the admin role and the Puestos section before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("forbidden"));

    await expect(page("lunch-1")).rejects.toThrow("forbidden");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.getServePoint).not.toHaveBeenCalled();
  });

  it("is closed to an admin whose section access does not include Puestos", async () => {
    permissions.requireSection.mockRejectedValue(new Error("forbidden"));

    await expect(page("lunch-1")).rejects.toThrow("forbidden");
    expect(permissions.requireSection).toHaveBeenCalledWith(expect.objectContaining({ uid: "a1" }), "checkpoints");
    expect(server.getServePoint).not.toHaveBeenCalled();
  });

  it("shows the puesto's scanner as an admin, who operates every puesto, with the way back leading to Puestos", async () => {
    const tree = await page("lunch-1");

    expect(server.getServePoint).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" }, "lunch-1");
    expect(findElement(tree, ServeScreenBound)?.props).toEqual({
      checkpointId: "lunch-1",
      kind: "catering",
      name: "Almuerzo",
      description: "Plato fuerte",
      image: null,
      initialCount: 42,
      backHref: "/admin/puestos",
      backLabel: copy.admin.checkpoints.scanBack,
      // The row that switches between the open puestos, each scanner under this same route.
      stations: [
        { id: "lunch-1", name: "Almuerzo" },
        { id: "entrada", name: "Entrada principal" },
      ],
      stationBase: "/admin/puestos/escanear",
    });
    expect(server.listServePoints).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" });
  });

  it("still shows the scanner, without the row, when the list of puestos cannot be read", async () => {
    server.listServePoints.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    const tree = await page("lunch-1");

    expect(findElement(tree, ServeScreenBound)?.props.stations).toBeUndefined();
  });

  it.each(["checkpoint-not-found", "checkpoint-inactive", "not-station", "forbidden"])("is not found for a puesto that cannot be scanned (%s)", async (code) => {
    server.getServePoint.mockResolvedValue({ ok: false, error: { code } });

    await expect(page("x-1")).rejects.toBeInstanceOf(NotFound);
  });

  it("surfaces a failed read through the error boundary instead of a misleading not-found", async () => {
    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(page("lunch-1")).rejects.toThrow("Could not read the serving point");
  });
});
