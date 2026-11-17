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

const qrServer = { listScreenCheckpoints: vi.fn() };
vi.mock("@/features/ephemeral-qr/server", () => qrServer);

const { QrDisplay } = await import("@/features/ephemeral-qr");
const { ButtonLink } = await import("@/shared/ui");
const { copy } = await import("@/shared/copy/es");
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

const page = (checkpointId: string) =>
  AdminQrDisplayPage({ params: Promise.resolve({ checkpointId }) } as unknown as Parameters<typeof AdminQrDisplayPage>[0]);

describe("admin QR display page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    qrServer.listScreenCheckpoints.mockResolvedValue({ ok: true, value: [{ id: "talk-keynote", name: "Keynote", kind: "talk" }, { id: "entrada-norte", name: "Entrada norte", kind: "entrance" }] });
  });

  it("checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("forbidden"));

    await expect(page("talk-keynote")).rejects.toThrow("forbidden");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(qrServer.listScreenCheckpoints).not.toHaveBeenCalled();
  });

  it("shows the projector screen for an active talk, with the action that issues its codes", async () => {
    const tree = await page("talk-keynote");

    const display = findElement(tree, QrDisplay);
    expect(display?.props).toMatchObject({ checkpointId: "talk-keynote", name: "Keynote", issue: issueQrAction });
  });

  it("shows the door screen for an open entrance, with the entrance's own hint, and leads back to Puestos", async () => {
    const tree = await page("entrada-norte");

    const display = findElement(tree, QrDisplay);
    expect(display?.props).toMatchObject({ checkpointId: "entrada-norte", name: "Entrada norte", issue: issueQrAction, texts: { scanHint: copy.admin.qr.scanHintEntrance } });
    const links = findAll(tree, ButtonLink);
    expect(links[0].props).toMatchObject({ href: "/admin/puestos" });
    expect(findElement(await page("talk-keynote"), ButtonLink)?.props).toMatchObject({ href: "/admin/charlas" });
    expect(findElement(await page("talk-keynote"), QrDisplay)?.props.texts).toBeUndefined();
  });

  it.each(["talk-unknown", "lunch-1", "talk-closed"])(
    "is not found for %s: only open talks and entrances can show a code",
    async (id) => {
      await expect(page(id)).rejects.toBeInstanceOf(NotFound);
    },
  );

  it("surfaces a failed read through the error boundary instead of a misleading not-found", async () => {
    qrServer.listScreenCheckpoints.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(page("talk-keynote")).rejects.toThrow("Could not read the checkpoints");
  });
});
