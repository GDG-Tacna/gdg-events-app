import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app-shell/composition/avatar.server", () => ({ avatarDeps: { marker: "avatars" } }));
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ saveAvatarLook: vi.fn(), resetAvatarLook: vi.fn() }));
vi.mock("@/features/avatar/server", () => server);

const { resetAvatarAction, saveAvatarAction } = await import("./avatar.actions");

const LOOK = { skin: 1, hairStyle: "curly", hairColor: 2, beard: "none", glasses: "round", helmet: 0, suit: 1 };
const session = { uid: "u1", role: "attendee", displayName: null, photoUrl: null };

describe("avatar actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.getSession.mockResolvedValue(session);
    server.saveAvatarLook.mockResolvedValue({ ok: true, value: LOOK });
    server.resetAvatarLook.mockResolvedValue({ ok: true, value: undefined });
  });

  it("save and reset the session's own look", async () => {
    expect(await saveAvatarAction({ look: LOOK })).toEqual({ ok: true });
    expect(server.saveAvatarLook).toHaveBeenCalledWith({ marker: "avatars" }, { uid: "u1", role: "attendee" }, LOOK);
    expect(await resetAvatarAction()).toEqual({ ok: true });
    expect(server.resetAvatarLook).toHaveBeenCalledWith({ marker: "avatars" }, { uid: "u1", role: "attendee" });
  });

  it("refuse without a session or with input of the wrong shape, and pass refusals through", async () => {
    expect(await saveAvatarAction({ look: { ...LOOK, skin: "dark" } })).toEqual({ ok: false, code: "invalid-look" });
    server.saveAvatarLook.mockResolvedValueOnce({ ok: false, error: { code: "forbidden" } });
    expect(await saveAvatarAction({ look: LOOK })).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(null);
    expect(await saveAvatarAction({ look: LOOK })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await resetAvatarAction()).toEqual({ ok: false, code: "unauthenticated" });
  });
});
