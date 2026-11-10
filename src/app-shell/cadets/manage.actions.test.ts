import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/cadets.server", () => ({ cadetsDeps: { marker: "cadets" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true) }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const server = vi.hoisted(() => ({ renameCadet: vi.fn(), changeCadetSquad: vi.fn(), banCadet: vi.fn(), unbanCadet: vi.fn(), deleteCadet: vi.fn() }));
vi.mock("@/features/cadets/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null, adminScope: "global" | "edition" = "edition") => ({ uid: "a1", role, adminScope, displayName: null, photoUrl: null });
const ACTOR = { uid: "a1", role: "admin", adminScope: "edition" };
const UID = "cadet-0001";

const calls = [
  ["rename", () => actions.renameCadetAction({ uid: UID, alias: "Estrella" }), server.renameCadet, { uid: UID, alias: "Estrella" }],
  ["change squad", () => actions.changeCadetSquadAction({ uid: UID, squad: "angular" }), server.changeCadetSquad, { uid: UID, squad: "angular" }],
  ["ban", () => actions.banCadetAction({ uid: UID, reason: "Spam" }), server.banCadet, { uid: UID, reason: "Spam" }],
  ["unban", () => actions.unbanCadetAction({ uid: UID }), server.unbanCadet, { uid: UID }],
  ["delete", () => actions.deleteCadetAction({ uid: UID }), server.deleteCadet, { uid: UID }],
] as const;

describe.each(calls)("%s", (_name, call, useCase, input) => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(true);
    useCase.mockResolvedValue({ ok: true, value: { alias: "Nova" } });
  });

  it("is off with the admin switched off, and needs a session", async () => {
    features.FEATURES.admin = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("is only for admins who may edit the Cadetes section", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(false);
    expect(await call()).toEqual({ ok: false, code: "forbidden" });

    expect(permissions.mayEdit).toHaveBeenLastCalledWith(expect.objectContaining({ role: "admin" }), "cadets");
    expect(useCase).not.toHaveBeenCalled();
  });

  it("hands the use case the actor of the session, with whether they are an admin of every edition", async () => {
    await call();
    expect(useCase).toHaveBeenLastCalledWith({ marker: "cadets" }, ACTOR, input);

    guards.getSession.mockResolvedValue(session("admin", "global"));
    await call();
    expect(useCase).toHaveBeenLastCalledWith({ marker: "cadets" }, { ...ACTOR, adminScope: "global" }, input);
  });

  it("passes a refusal through as its code", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "not-found" } });

    expect(await call()).toEqual({ ok: false, code: "not-found" });
  });
});

describe("answers and input shape", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockResolvedValue(true);
  });

  it("answers plainly ok after a change, and with the alias after a delete", async () => {
    server.renameCadet.mockResolvedValue({ ok: true, value: "Estrella" });
    server.deleteCadet.mockResolvedValue({ ok: true, value: { alias: "Nova", checkIns: 1, missions: 0, badges: 0, contacts: 0 } });

    expect(await actions.renameCadetAction({ uid: UID, alias: "Estrella" })).toEqual({ ok: true });
    expect(await actions.deleteCadetAction({ uid: UID })).toEqual({ ok: true, alias: "Nova" });
  });

  it("refuses input of the wrong shape before touching a use case", async () => {
    expect(await actions.renameCadetAction({ uid: "", alias: "x" })).toEqual({ ok: false, code: "invalid-alias" });
    expect(await actions.renameCadetAction({ uid: UID, alias: 7 } as never)).toEqual({ ok: false, code: "invalid-alias" });
    expect(await actions.changeCadetSquadAction({ uid: UID, squad: 7 } as never)).toEqual({ ok: false, code: "unknown-squad" });
    expect(await actions.banCadetAction({ uid: UID, reason: "x".repeat(401) })).toEqual({ ok: false, code: "invalid-reason" });
    expect(await actions.unbanCadetAction({ uid: 7 } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await actions.deleteCadetAction({ uid: "x".repeat(200) })).toEqual({ ok: false, code: "not-found" });
    for (const useCase of Object.values(server)) expect(useCase).not.toHaveBeenCalled();
  });

  it("lets a squad be cleared with null", async () => {
    server.changeCadetSquad.mockResolvedValue({ ok: true, value: undefined });

    expect(await actions.changeCadetSquadAction({ uid: UID, squad: null })).toEqual({ ok: true });
    expect(server.changeCadetSquad).toHaveBeenCalledWith({ marker: "cadets" }, ACTOR, { uid: UID, squad: null });
  });
});
