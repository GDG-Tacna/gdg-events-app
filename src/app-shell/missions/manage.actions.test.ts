import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/mission-admin.server", () => ({ missionAdminDeps: { marker: "admin" } }));
const source = { invalidate: vi.fn() };
vi.mock("@/app-shell/composition/missions.server", () => ({ missionSource: source }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = {
  DEFAULT_MISSIONS: [{ id: "seed-1" }],
  seedMissions: vi.fn(),
  createMission: vi.fn(),
  updateMission: vi.fn(),
  setMissionActive: vi.fn(),
  moveMission: vi.fn(),
};
vi.mock("@/features/missions/server", () => server);

const permissions = vi.hoisted(() => ({ mayEdit: vi.fn(async (session: { role: string | null }) => session.role === "admin") }));
vi.mock("@/app-shell/permissions.server", () => permissions);
const features = vi.hoisted(() => ({ FEATURES: { admin: true, missions: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const DRAFT = { title: "Desafío", description: "", quadrantId: "ai", xp: 40, config: { type: "quiz", question: "¿Q?", options: ["a", "b"], answer: 0 } };
const ADMIN = { uid: "a1", role: "admin" };

describe("mission admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.missions = true;
    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockImplementation(async (who: { role: string | null }) => who.role === "admin");
    for (const name of ["seedMissions", "createMission", "updateMission", "setMissionActive", "moveMission"] as const) {
      server[name].mockResolvedValue({ ok: true, value: null });
    }
  });

  const calls = [
    ["seed", () => actions.seedMissionsAction()],
    ["create", () => actions.createMissionAction({ id: "m-1", draft: DRAFT })],
    ["update", () => actions.updateMissionAction({ id: "m-1", draft: DRAFT })],
    ["activate", () => actions.setMissionActiveAction({ id: "m-1", active: true })],
    ["move", () => actions.moveMissionAction({ id: "m-1", to: 0 })],
  ] as const;

  it.each(calls)("%s does nothing when the admin or missions are switched off", async (_, call) => {
    features.FEATURES.missions = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.missions = true;
    features.FEATURES.admin = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it.each(calls)("%s refuses anyone who is not an admin", async (_, call) => {
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });

  it.each(calls)("%s refuses an organizer the edition lets only view missions", async (_, call) => {
    permissions.mayEdit.mockResolvedValue(false);

    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(permissions.mayEdit).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "missions");
  });

  it("seeds the bundled missions and drops the attendees' cached missions", async () => {
    expect(await actions.seedMissionsAction()).toEqual({ ok: true });
    expect(server.seedMissions).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, server.DEFAULT_MISSIONS);
    expect(source.invalidate).toHaveBeenCalledTimes(1);
  });

  it("creates and updates with the actor of the session", async () => {
    await actions.createMissionAction({ id: "m-1", draft: DRAFT });
    await actions.updateMissionAction({ id: "m-1", draft: DRAFT });

    expect(server.createMission).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "m-1", draft: DRAFT });
    expect(server.updateMission).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "m-1", draft: DRAFT });
    expect(source.invalidate).toHaveBeenCalledTimes(2);
  });

  it("passes the G-Credits and the mini-game through to the use case", async () => {
    const draft = { ...DRAFT, credits: 15, minigame: "circuits", minigameDifficulty: "hard" };

    await actions.createMissionAction({ id: "m-1", draft });
    await actions.updateMissionAction({ id: "m-1", draft: { ...DRAFT, credits: null, minigame: null, minigameDifficulty: null } });

    expect(server.createMission).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "m-1", draft });
    expect(server.updateMission.mock.calls[0][2].draft).toMatchObject({ credits: null, minigame: null, minigameDifficulty: null });
  });

  it.each([
    ["an unknown type", { id: "m-1", draft: { ...DRAFT, config: { type: "dance" } } }],
    ["a missing draft", { id: "m-1" }],
    ["too many options", { id: "m-1", draft: { ...DRAFT, config: { type: "quiz", question: "q", options: Array(7).fill("a"), answer: 0 } } }],
    ["XP as text", { id: "m-1", draft: { ...DRAFT, xp: "40" } }],
    ["credits as text", { id: "m-1", draft: { ...DRAFT, credits: "15" } }],
    ["a game that is not text", { id: "m-1", draft: { ...DRAFT, minigame: 3 } }],
  ])("rejects %s before touching the use case", async (_, input) => {
    expect(await actions.createMissionAction(input as never)).toEqual({ ok: false, code: "invalid-type" });
    expect(server.createMission).not.toHaveBeenCalled();
  });

  it("activates and moves only with a well-formed input", async () => {
    expect(await actions.setMissionActiveAction({ id: "m-1", active: "yes" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await actions.moveMissionAction({ id: "m-1", to: 1.5 })).toEqual({ ok: false, code: "not-found" });

    await actions.setMissionActiveAction({ id: "m-1", active: false });
    await actions.moveMissionAction({ id: "m-1", to: 2 });
    expect(server.setMissionActive).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "m-1", active: false });
    expect(server.moveMission).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "m-1", to: 2 });
  });

  it("passes a refusal through and keeps the cache", async () => {
    server.updateMission.mockResolvedValue({ ok: false, error: { code: "type-change" } });

    expect(await actions.updateMissionAction({ id: "m-1", draft: DRAFT })).toEqual({ ok: false, code: "type-change" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });
});
