import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ speakerAdminDeps: { marker: "speakers" }, keptSpeakers: { clear: vi.fn() } }));
vi.mock("@/app-shell/composition/speakers.server", () => composition);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { createSpeaker: vi.fn(), updateSpeaker: vi.fn(), setSpeakerActive: vi.fn() };
vi.mock("@/features/speakers/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { createSpeakerAction, setSpeakerActiveAction, updateSpeakerAction } = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };
const DRAFT = { name: "Ana Torres", headline: "GDE", bio: "", links: { linkedin: "", github: "", web: "" } };

describe("speaker admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("hand the admin's session and the input to the use cases, and forget the kept speakers", async () => {
    server.createSpeaker.mockResolvedValue({ ok: true, value: {} });
    server.updateSpeaker.mockResolvedValue({ ok: true, value: {} });
    server.setSpeakerActive.mockResolvedValue({ ok: true, value: {} });

    expect(await createSpeakerAction({ id: "ana-torres", draft: DRAFT })).toEqual({ ok: true });
    expect(server.createSpeaker).toHaveBeenCalledWith({ marker: "speakers" }, ADMIN, { id: "ana-torres", draft: DRAFT, photoPath: null });
    expect(await updateSpeakerAction({ id: "ana-torres", draft: DRAFT })).toEqual({ ok: true });
    // No photo path means "keep the photo": it is not turned into a removal.
    expect(server.updateSpeaker).toHaveBeenCalledWith({ marker: "speakers" }, ADMIN, { id: "ana-torres", draft: DRAFT });
    expect(await setSpeakerActiveAction({ id: "ana-torres", active: false })).toEqual({ ok: true });
    expect(server.setSpeakerActive).toHaveBeenCalledWith({ marker: "speakers" }, ADMIN, { id: "ana-torres", active: false });
    expect(composition.keptSpeakers.clear).toHaveBeenCalledTimes(3);
  });

  it("pass a refusal's code through", async () => {
    server.createSpeaker.mockResolvedValue({ ok: false, error: { code: "already-exists" } });

    expect(await createSpeakerAction({ id: "ana-torres", draft: DRAFT })).toEqual({ ok: false, code: "already-exists" });
    expect(composition.keptSpeakers.clear).not.toHaveBeenCalled();
  });

  it("refuse when switched off, without a session, or for anyone but an admin", async () => {
    features.FEATURES.admin = false;
    expect(await createSpeakerAction({ id: "ana-torres", draft: DRAFT })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;

    guards.getSession.mockResolvedValue(null);
    expect(await updateSpeakerAction({ id: "ana-torres", draft: DRAFT })).toEqual({ ok: false, code: "unauthenticated" });

    for (const role of ["staff", "attendee", null] as const) {
      guards.getSession.mockResolvedValue(session(role));
      expect(await setSpeakerActiveAction({ id: "ana-torres", active: true })).toEqual({ ok: false, code: "forbidden" });
    }
    expect(server.createSpeaker).not.toHaveBeenCalled();
    expect(server.updateSpeaker).not.toHaveBeenCalled();
    expect(server.setSpeakerActive).not.toHaveBeenCalled();
  });

  it("refuse input of the wrong shape before touching the use cases", async () => {
    expect(await createSpeakerAction({ id: "ana-torres", draft: { ...DRAFT, name: "x".repeat(201) } })).toEqual({ ok: false, code: "invalid-name" });
    expect(await updateSpeakerAction(undefined as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await setSpeakerActiveAction({ id: "ana-torres", active: "yes" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(server.createSpeaker).not.toHaveBeenCalled();
    expect(server.updateSpeaker).not.toHaveBeenCalled();
    expect(server.setSpeakerActive).not.toHaveBeenCalled();
  });
});
