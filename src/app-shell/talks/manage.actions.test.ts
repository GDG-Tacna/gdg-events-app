import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ talkAdminDeps: { marker: "talks" }, refreshAgenda: vi.fn() }));
vi.mock("@/app-shell/composition/talks.server", () => composition);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { createTalk: vi.fn(), updateTalk: vi.fn(), setTalkActive: vi.fn() };
vi.mock("@/features/talks/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { createTalkAction, setTalkActiveAction, updateTalkAction } = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const DRAFT = { title: "Keynote", speaker: "Ana", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: null, description: "" };

describe("talk admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("hand the admin's session and the input to the use cases, and answer ok", async () => {
    server.createTalk.mockResolvedValue({ ok: true, value: {} });
    server.updateTalk.mockResolvedValue({ ok: true, value: {} });
    server.setTalkActive.mockResolvedValue({ ok: true, value: {} });

    expect(await createTalkAction({ id: "keynote", draft: DRAFT })).toEqual({ ok: true });
    expect(server.createTalk).toHaveBeenCalledWith({ marker: "talks" }, { uid: "a1", role: "admin" }, { id: "keynote", draft: DRAFT });
    expect(await updateTalkAction({ id: "keynote", draft: DRAFT })).toEqual({ ok: true });
    expect(server.updateTalk).toHaveBeenCalledWith({ marker: "talks" }, { uid: "a1", role: "admin" }, { id: "keynote", draft: DRAFT });
    expect(await setTalkActiveAction({ id: "keynote", active: false })).toEqual({ ok: true });
    expect(server.setTalkActive).toHaveBeenCalledWith({ marker: "talks" }, { uid: "a1", role: "admin" }, { id: "keynote", active: false });
    // Every change shows in the cadets' agenda at once.
    expect(composition.refreshAgenda).toHaveBeenCalledTimes(3);
  });

  it("pass a refusal's code through", async () => {
    server.createTalk.mockResolvedValue({ ok: false, error: { code: "unknown-room" } });

    expect(await createTalkAction({ id: "keynote", draft: DRAFT })).toEqual({ ok: false, code: "unknown-room" });
    expect(composition.refreshAgenda).not.toHaveBeenCalled();
  });

  it("refuse when switched off, without a session, or for anyone but an admin", async () => {
    features.FEATURES.checkins = false;
    expect(await createTalkAction({ id: "keynote", draft: DRAFT })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.checkins = true;

    guards.getSession.mockResolvedValue(null);
    expect(await updateTalkAction({ id: "keynote", draft: DRAFT })).toEqual({ ok: false, code: "unauthenticated" });

    for (const role of ["staff", "attendee", null] as const) {
      guards.getSession.mockResolvedValue(session(role));
      expect(await setTalkActiveAction({ id: "keynote", active: true })).toEqual({ ok: false, code: "forbidden" });
    }
    expect(server.createTalk).not.toHaveBeenCalled();
    expect(server.updateTalk).not.toHaveBeenCalled();
    expect(server.setTalkActive).not.toHaveBeenCalled();
  });

  it("refuse input of the wrong shape before touching the use cases", async () => {
    expect(await createTalkAction({ id: "keynote", draft: { ...DRAFT, title: "x".repeat(201) } })).toEqual({ ok: false, code: "invalid-title" });
    expect(await updateTalkAction(undefined as never)).toEqual({ ok: false, code: "invalid-title" });
    expect(await setTalkActiveAction({ id: "keynote", active: "yes" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(server.createTalk).not.toHaveBeenCalled();
    expect(server.updateTalk).not.toHaveBeenCalled();
    expect(server.setTalkActive).not.toHaveBeenCalled();
  });
});
