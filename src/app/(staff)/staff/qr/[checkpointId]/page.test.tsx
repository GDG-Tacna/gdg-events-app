import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));
vi.mock("@/app-shell/ephemeral-qr/issue-qr.action", () => ({ issueQrAction: async () => ({ ok: false, code: "unknown" }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const server = { getServePoint: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const permissions = vi.hoisted(() => ({
  staffStations: vi.fn(async () => ["entrance", "catering", "stand"]),
  staffCheckpoints: vi.fn<(session: unknown) => Promise<readonly string[] | undefined>>(async () => undefined),
}));
vi.mock("@/app-shell/permissions.server", () => permissions);

const { QrDisplay } = await import("@/features/ephemeral-qr");
const { issueQrAction } = await import("@/app-shell/ephemeral-qr/issue-qr.action");
const { ButtonLink } = await import("@/shared/ui");
const { copy } = await import("@/shared/copy/es");
const { default: StaffScreenQrPage } = await import("./page");

function findAll(node: ReactNode, type: unknown, found: Array<{ props: Record<string, unknown> }> = []): Array<{ props: Record<string, unknown> }> {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) found.push(element);
  return findAll(element.props.children as ReactNode, type, found);
}

const page = (checkpointId: string) => StaffScreenQrPage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof StaffScreenQrPage>[0]);
const POINT = { id: "entrada-norte", kind: "entrance", name: "Entrada norte", servedCount: 3 };

describe("staff screen QR page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    permissions.staffStations.mockResolvedValue(["entrance", "catering", "stand"]);
    permissions.staffCheckpoints.mockResolvedValue(undefined);
    features.FEATURES.checkins = true;
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
    server.getServePoint.mockResolvedValue({ ok: true, value: POINT });
  });

  it("checks the staff role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(page("entrada-norte")).rejects.toThrow("not-found");
    expect(server.getServePoint).not.toHaveBeenCalled();
  });

  it("reads the station as the session's user, limited to the kinds staff may operate", async () => {
    await page("entrada-norte");

    expect(server.getServePoint).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"] }, "entrada-norte");
  });

  it("shows the entrance's code on the door screen with its own hint, and leads back to the stations", async () => {
    const tree = await page("entrada-norte");

    const display = findAll(tree, QrDisplay)[0];
    expect(display.props).toMatchObject({ checkpointId: "entrada-norte", name: "Entrada norte", issue: issueQrAction, texts: { scanHint: copy.admin.qr.scanHintEntrance } });
    expect(findAll(tree, ButtonLink)[0].props).toMatchObject({ href: "/staff" });
  });

  it("reads the station with the stations an admin limited the staff member to", async () => {
    permissions.staffCheckpoints.mockResolvedValue(["stand-louis"]);

    await page("stand-louis");

    expect(server.getServePoint).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"], checkpointIds: ["stand-louis"] }, "stand-louis");
  });

  it("shows a stand's code on the stand's tablet with the stand's own hint", async () => {
    server.getServePoint.mockResolvedValue({ ok: true, value: { id: "stand-louis", kind: "stand", name: "Stand Louis 3D", servedCount: 4 } });

    const display = findAll(await page("stand-louis"), QrDisplay)[0];
    expect(display.props).toMatchObject({ checkpointId: "stand-louis", name: "Stand Louis 3D", issue: issueQrAction, texts: { scanHint: copy.admin.qr.scanHintStand } });
  });

  it("is not found for a meal: the catering scans the cadet's pass, it has no code on a screen", async () => {
    server.getServePoint.mockResolvedValue({ ok: true, value: { ...POINT, kind: "catering" } });
    await expect(page("lunch-1")).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found for an unknown, closed or not-allowed station, and surfaces a failed read", async () => {
    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "not-found" } });
    await expect(page("ghost-1")).rejects.toBeInstanceOf(NotFound);
    // Another stand than the one a limited account was given.
    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "forbidden" } });
    await expect(page("stand-cloud")).rejects.toBeInstanceOf(NotFound);

    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(page("entrada-norte")).rejects.toThrow("Could not read the serving point");
  });

  it("is not found when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(page("entrada-norte")).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });
});
