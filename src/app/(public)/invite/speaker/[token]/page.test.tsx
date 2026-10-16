import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
class NotFound extends Error {}
class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAccessDeps: { marker: "access" } }));
vi.mock("@/app-shell/speakers/access.actions", () => ({ acceptSpeakerInviteAction: vi.fn() }));
const guards = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ previewSpeakerInvite: vi.fn() }));
vi.mock("@/features/speakers/server", async () => ({ ...server, splitSpeakerToken: (await import("@/features/speakers/domain/access")).splitSpeakerToken }));
const edition = vi.hoisted(() => ({ runInEdition: vi.fn() }));
vi.mock("@/features/event/server", () => edition);

const { SpeakerInvitePanel } = await import("@/features/speakers");
const { acceptSpeakerInviteAction } = await import("@/app-shell/speakers/access.actions");
const { default: SpeakerInvitePage, metadata } = await import("./page");

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

const SECRET = "s".repeat(43);
const open = (token = `devfest-2026.${SECRET}`) => SpeakerInvitePage({ params: Promise.resolve({ token }) });

describe("speaker invitation page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    edition.runInEdition.mockImplementation(async (_eventId: string, work: () => Promise<unknown>) => work());
    server.previewSpeakerInvite.mockResolvedValue({ ok: true, value: { name: "Ana Torres", email: "an•••@gmail.com", state: "pending", accountUid: null } });
    guards.getSession.mockResolvedValue(null);
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("reads the link in the edition it names and shows it with the accept action", async () => {
    const panel = findElement(await open(), SpeakerInvitePanel);

    expect(edition.runInEdition).toHaveBeenCalledWith("devfest-2026", expect.any(Function));
    expect(server.previewSpeakerInvite).toHaveBeenCalledWith({ marker: "access" }, SECRET);
    expect(panel?.props).toEqual({
      token: `devfest-2026.${SECRET}`,
      name: "Ana Torres",
      maskedEmail: "an•••@gmail.com",
      state: "pending",
      signedIn: false,
      accept: acceptSpeakerInviteAction,
      homeHref: "/speaker",
    });
  });

  it("sends the linked speaker straight to their code", async () => {
    guards.getSession.mockResolvedValue({ uid: "a1", role: null });
    server.previewSpeakerInvite.mockResolvedValue({ ok: true, value: { name: "Ana Torres", email: "an•••@gmail.com", state: "accepted", accountUid: "a1" } });

    await expect(open()).rejects.toThrow(new Redirect("/speaker"));
  });

  it("is not found for a malformed or unknown link, and surfaces a failed read", async () => {
    await expect(open("nope")).rejects.toBeInstanceOf(NotFound);
    server.previewSpeakerInvite.mockResolvedValueOnce({ ok: false, error: { code: "not-found" } });
    await expect(open()).rejects.toBeInstanceOf(NotFound);
    server.previewSpeakerInvite.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(open()).rejects.toThrow("Could not read the speaker's link");
  });
});
