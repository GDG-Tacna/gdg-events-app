import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));
vi.mock("@/app-shell/ServeScreenBound", () => ({ ServeScreenBound: () => null }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { getServePoint: vi.fn(), listServePoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { ServeScreenBound } = await import("@/app-shell/ServeScreenBound");
const { default: StaffServePage } = await import("./page");

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
  StaffServePage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof StaffServePage>[0]);

describe("staff serve page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
    server.getServePoint.mockResolvedValue({ ok: true, value: { id: "lunch-1", name: "Almuerzo", servedCount: 42 } });
    server.listServePoints.mockResolvedValue({
      ok: true,
      value: [
        { id: "lunch-1", kind: "catering", name: "Almuerzo", description: "", image: null, servedCount: 42 },
        { id: "entrance-1", kind: "entrance", name: "Entrada", description: "", image: null, servedCount: 7 },
      ],
    });
  });

  it("checks the staff role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(page("lunch-1")).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["staff"]);
    expect(server.getServePoint).not.toHaveBeenCalled();
  });

  it("shows the serve screen for the point, with its name and the rations handed out so far", async () => {
    const tree = await page("lunch-1");

    expect(server.getServePoint).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"] }, "lunch-1");
    expect(findElement(tree, ServeScreenBound)?.props).toEqual({
      checkpointId: "lunch-1",
      name: "Almuerzo",
      initialCount: 42,
      // The row that switches between the puestos this person may operate: just their ids and names.
      stations: [
        { id: "lunch-1", name: "Almuerzo" },
        { id: "entrance-1", name: "Entrada" },
      ],
    });
  });

  it("lists the puestos as the same staff member, so the row only has what they may operate", async () => {
    await page("lunch-1");

    expect(server.listServePoints).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"] });
  });

  it("still shows the scanner, without the row, when the list of puestos cannot be read", async () => {
    server.listServePoints.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    const tree = await page("lunch-1");

    expect(findElement(tree, ServeScreenBound)?.props.stations).toBeUndefined();
  });

  it.each(["checkpoint-not-found", "checkpoint-inactive", "not-catering", "forbidden"])(
    "is not found for a point that cannot serve (%s)",
    async (code) => {
      server.getServePoint.mockResolvedValue({ ok: false, error: { code } });

      await expect(page("x-1")).rejects.toBeInstanceOf(NotFound);
    },
  );

  it("surfaces a failed read through the error boundary instead of a misleading not-found", async () => {
    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(page("lunch-1")).rejects.toThrow("Could not read the serving point");
  });
});
