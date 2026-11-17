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

const { QrDisplay } = await import("@/features/ephemeral-qr");
const { issueQrAction } = await import("@/app-shell/ephemeral-qr/issue-qr.action");
const { ButtonLink } = await import("@/shared/ui");
const { copy } = await import("@/shared/copy/es");
const { default: StaffEntranceQrPage } = await import("./page");

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

const page = (checkpointId: string) => StaffEntranceQrPage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof StaffEntranceQrPage>[0]);
const POINT = { id: "entrada-norte", kind: "entrance", name: "Entrada norte", servedCount: 3 };

describe("staff entrance QR page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("is not found for a meal or a stand: only the entrance has a code that changes on a screen", async () => {
    server.getServePoint.mockResolvedValue({ ok: true, value: { ...POINT, kind: "catering" } });
    await expect(page("lunch-1")).rejects.toBeInstanceOf(NotFound);

    server.getServePoint.mockResolvedValue({ ok: true, value: { ...POINT, kind: "stand" } });
    await expect(page("stand-cloud")).rejects.toBeInstanceOf(NotFound);
  });

  it("is not found for an unknown, closed or not-allowed station, and surfaces a failed read", async () => {
    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "not-found" } });
    await expect(page("ghost-1")).rejects.toBeInstanceOf(NotFound);

    server.getServePoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(page("entrada-norte")).rejects.toThrow("Could not read the serving point");
  });

  it("is not found when check-ins are switched off, without reading the session", async () => {
    features.FEATURES.checkins = false;

    await expect(page("entrada-norte")).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });
});
