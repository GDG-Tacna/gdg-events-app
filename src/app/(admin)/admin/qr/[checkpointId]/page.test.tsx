import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ephemeral-qr.server", () => ({ ephemeralQrDeps: { marker: "deps" } }));
vi.mock("@/app-shell/ephemeral-qr/issue-qr.action", () => ({ issueQrAction: async () => ({ ok: false, code: "unknown" }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const qrServer = { listTalks: vi.fn() };
vi.mock("@/features/ephemeral-qr/server", () => qrServer);

const { QrDisplay } = await import("@/features/ephemeral-qr");
const { issueQrAction } = await import("@/app-shell/ephemeral-qr/issue-qr.action");
const { default: AdminQrDisplayPage } = await import("./page");

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
  AdminQrDisplayPage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof AdminQrDisplayPage>[0]);

describe("admin QR display page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    qrServer.listTalks.mockResolvedValue({ ok: true, value: [{ id: "talk-keynote", name: "Keynote" }] });
  });

  it("checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("forbidden"));

    await expect(page("talk-keynote")).rejects.toThrow("forbidden");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(qrServer.listTalks).not.toHaveBeenCalled();
  });

  it("shows the projector screen for an active talk, with the action that issues its codes", async () => {
    const tree = await page("talk-keynote");

    const display = findElement(tree, QrDisplay);
    expect(display?.props).toMatchObject({ checkpointId: "talk-keynote", name: "Keynote", issue: issueQrAction });
  });

  it.each(["talk-unknown", "lunch-1", "talk-closed"])(
    "is not found for %s: only active talks can be projected",
    async (id) => {
      await expect(page(id)).rejects.toBeInstanceOf(NotFound);
    },
  );

  it("surfaces a failed read through the error boundary instead of a misleading not-found", async () => {
    qrServer.listTalks.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(page("talk-keynote")).rejects.toThrow("Could not read the talks");
  });
});
