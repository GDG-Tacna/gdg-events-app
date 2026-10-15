import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
class NotFound extends Error {}
vi.mock("next/navigation", () => ({ notFound: () => { throw new NotFound("not-found"); } }));
vi.mock("@/app-shell/composition/admin.server", () => ({ inviteDeps: () => ({ marker: "invites" }) }));
vi.mock("@/app-shell/admin/invite.actions", () => ({ acceptInviteAction: async () => ({ ok: true, role: "staff" }) }));
const guards = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ previewInvite: vi.fn() }));
vi.mock("@/features/admin/server", async () => ({ ...server, splitInviteToken: (await import("@/features/admin/domain/invites")).splitInviteToken }));
const edition = vi.hoisted(() => ({ runInEdition: vi.fn() }));
vi.mock("@/features/event/server", () => edition);
const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { InviteAcceptPanel } = await import("@/features/admin");
const { acceptInviteAction } = await import("@/app-shell/admin/invite.actions");
const { default: InvitePage, metadata } = await import("./page");

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

const open = (secret = "s".repeat(43)) => InvitePage({ params: Promise.resolve({ secret }) });

describe("invite page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    edition.runInEdition.mockImplementation(async (_eventId: string, work: () => Promise<unknown>) => work());
    features.FEATURES.admin = true;
    server.previewInvite.mockResolvedValue({ ok: true, value: { role: "organizer", email: "an•••@example.com", state: "pending" } });
    guards.getSession.mockResolvedValue(null);
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("shows the invitation to a visitor with the accept action", async () => {
    const panel = findElement(await open(), InviteAcceptPanel);

    expect(server.previewInvite).toHaveBeenCalledWith({ marker: "invites" }, "s".repeat(43));
    expect(panel?.props).toEqual({ secret: "s".repeat(43), role: "organizer", maskedEmail: "an•••@example.com", state: "pending", signedIn: false, accept: acceptInviteAction });
  });

  it("knows when the person is already signed in", async () => {
    guards.getSession.mockResolvedValue({ uid: "u1", role: null });

    expect(findElement(await open(), InviteAcceptPanel)?.props.signedIn).toBe(true);
  });

  it("answers not found for an unknown link or with the admin area off, and fails loudly on a read error", async () => {
    server.previewInvite.mockResolvedValue({ ok: false, error: { code: "not-found" } });
    await expect(open()).rejects.toThrow("not-found");

    server.previewInvite.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(open()).rejects.toThrow("Could not read the invitation");

    features.FEATURES.admin = false;
    await expect(open()).rejects.toThrow("not-found");
  });

  it("reads an invitation in the edition its link names, and answers not found for something that is not a link", async () => {
    const panel = findElement(await open(`meetup-nov.${"s".repeat(43)}`), InviteAcceptPanel);

    expect(edition.runInEdition).toHaveBeenCalledWith("meetup-nov", expect.any(Function));
    expect(server.previewInvite).toHaveBeenCalledWith({ marker: "invites" }, "s".repeat(43));
    expect(panel?.props.secret).toBe(`meetup-nov.${"s".repeat(43)}`);

    await expect(open("nope")).rejects.toThrow("not-found");
  });
});
