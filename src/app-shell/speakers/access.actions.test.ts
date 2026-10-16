import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerAccessDeps: { marker: "access" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const event = vi.hoisted(() => ({ runInEdition: vi.fn(async (_eventId: string, work: () => Promise<unknown>) => work()) }));
vi.mock("@/features/event/server", () => event);

const server = vi.hoisted(() => ({ inviteSpeaker: vi.fn(), unlinkSpeaker: vi.fn(), acceptSpeakerInvite: vi.fn(), splitSpeakerToken: vi.fn() }));
vi.mock("@/features/speakers/server", async (importOriginal) => ({
  ...server,
  splitSpeakerToken: (await importOriginal<typeof import("@/features/speakers/server")>()).splitSpeakerToken,
}));

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { acceptSpeakerInviteAction, inviteSpeakerAction, unlinkSpeakerAction } = await import("./access.actions");

const SECRET = "s".repeat(43);
const session = (role: "attendee" | "staff" | "admin" | null, verifiedEmail: string | null = "ana@gmail.com") => ({ uid: "u1", role, displayName: null, photoUrl: null, verifiedEmail });

describe("speaker access actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("invite and unlink for an admin with the talks section, answering the link's path once", async () => {
    server.inviteSpeaker.mockResolvedValue({ ok: true, value: { path: "/invite/speaker/e1.x", expiresAt: new Date(0) } });
    server.unlinkSpeaker.mockResolvedValue({ ok: true, value: undefined });

    expect(await inviteSpeakerAction({ speakerId: "ana", email: "ana@gmail.com" })).toEqual({ ok: true, path: "/invite/speaker/e1.x" });
    expect(server.inviteSpeaker).toHaveBeenCalledWith({ marker: "access" }, { uid: "u1", role: "admin" }, { speakerId: "ana", email: "ana@gmail.com" });
    expect(await unlinkSpeakerAction({ speakerId: "ana" })).toEqual({ ok: true });
  });

  it("refuse anyone but an admin, and pass a refusal's code through", async () => {
    guards.getSession.mockResolvedValue(session("attendee"));
    expect(await inviteSpeakerAction({ speakerId: "ana", email: "ana@gmail.com" })).toEqual({ ok: false, code: "forbidden" });
    guards.getSession.mockResolvedValue(null);
    expect(await unlinkSpeakerAction({ speakerId: "ana" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(server.inviteSpeaker).not.toHaveBeenCalled();

    guards.getSession.mockResolvedValue(session("admin"));
    server.inviteSpeaker.mockResolvedValue({ ok: false, error: { code: "inactive" } });
    expect(await inviteSpeakerAction({ speakerId: "ana", email: "ana@gmail.com" })).toEqual({ ok: false, code: "inactive" });
  });

  it("accept a link for any signed-in account, in the edition the link names, with the session's verified email", async () => {
    guards.getSession.mockResolvedValue(session(null));
    server.acceptSpeakerInvite.mockResolvedValue({ ok: true, value: { speakerId: "ana" } });

    expect(await acceptSpeakerInviteAction({ token: `devfest-2026.${SECRET}` })).toEqual({ ok: true });
    expect(event.runInEdition).toHaveBeenCalledWith("devfest-2026", expect.any(Function));
    expect(server.acceptSpeakerInvite).toHaveBeenCalledWith({ marker: "access" }, { uid: "u1", verifiedEmail: "ana@gmail.com" }, SECRET);
  });

  it("refuse a link that is not one, a missing session, or the feature switched off", async () => {
    expect(await acceptSpeakerInviteAction({ token: "nope" })).toEqual({ ok: false, code: "not-found" });
    guards.getSession.mockResolvedValue(null);
    expect(await acceptSpeakerInviteAction({ token: `devfest-2026.${SECRET}` })).toEqual({ ok: false, code: "unauthenticated" });
    features.FEATURES.checkins = false;
    expect(await acceptSpeakerInviteAction({ token: `devfest-2026.${SECRET}` })).toEqual({ ok: false, code: "disabled" });
    expect(server.acceptSpeakerInvite).not.toHaveBeenCalled();
  });
});
