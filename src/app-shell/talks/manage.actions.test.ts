import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ talkAdminDeps: { marker: "talks" }, refreshAgenda: vi.fn() }));
vi.mock("@/app-shell/composition/talks.server", () => composition);

const deletion = vi.hoisted(() => ({ mayDeleteItems: vi.fn(async () => true) }));
vi.mock("@/app-shell/deletion.server", () => deletion);
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { createTalk: vi.fn(), updateTalk: vi.fn(), setTalkActive: vi.fn(), deleteTalk: vi.fn() };
vi.mock("@/features/talks/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { createTalkAction, deleteTalkAction, setTalkActiveAction, updateTalkAction } = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const DRAFT = { title: "Keynote", speakerIds: ["ana"], startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: null, description: "" };

describe("talk admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
    deletion.mayDeleteItems.mockResolvedValue(true);
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

describe("deleteTalkAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
    deletion.mayDeleteItems.mockResolvedValue(true);
  });

  it("deletes with the actor of the session, answers the title and refreshes the agenda", async () => {
    server.deleteTalk.mockResolvedValue({ ok: true, value: { id: "keynote", title: "Keynote" } });

    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: true, title: "Keynote" });

    expect(server.deleteTalk).toHaveBeenCalledWith({ marker: "talks" }, { uid: "a1", role: "admin" }, { id: "keynote" });
    expect(composition.refreshAgenda).toHaveBeenCalledTimes(1);
  });

  it("is off with the admin or check-ins switched off, and only for signed-in admins", async () => {
    features.FEATURES.checkins = false;
    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(null);
    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: false, code: "forbidden" });
    expect(server.deleteTalk).not.toHaveBeenCalled();
  });

  it("refuses to delete once the edition is published, unless the admin is allowed to, and keeps the agenda", async () => {
    deletion.mayDeleteItems.mockResolvedValue(false);

    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: false, code: "edition-locked" });

    expect(server.deleteTalk).not.toHaveBeenCalled();
    expect(composition.refreshAgenda).not.toHaveBeenCalled();
  });

  it("deletes only with a well-formed input, and passes a refusal through without refreshing", async () => {
    expect(await deleteTalkAction({ id: 7 } as never)).toEqual({ ok: false, code: "not-found" });
    server.deleteTalk.mockResolvedValue({ ok: false, error: { code: "has-check-ins" } });

    expect(await deleteTalkAction({ id: "keynote" })).toEqual({ ok: false, code: "has-check-ins" });
    expect(composition.refreshAgenda).not.toHaveBeenCalled();
  });
});
