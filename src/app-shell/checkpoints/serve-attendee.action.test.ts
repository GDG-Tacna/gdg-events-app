import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));
const foodGate = vi.hoisted(() => ({ describeShortfall: vi.fn(async (missing: object) => ({ ...missing, levelName: "Piloto" })) }));
vi.mock("@/app-shell/composition/food-gate.server", () => foodGate);
const followUps = vi.hoisted(() => ({ unlockAchievements: vi.fn(), completeByCheckpoint: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => ({ unlockAchievements: followUps.unlockAchievements }));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
vi.mock("@/features/missions/server", () => ({ completeByCheckpoint: followUps.completeByCheckpoint }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const checkpointsServer = { serveAttendee: vi.fn() };
vi.mock("@/features/checkpoints/server", () => checkpointsServer);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true, missions: true } }));
vi.mock("@/shared/config/features", () => features);

const { serveAttendeeAction } = await import("./serve-attendee.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "s1", role, displayName: null, photoUrl: null });
const input = { checkpointId: "lunch-1", payload: "devfest:at:abc" };

describe("serveAttendeeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    features.FEATURES.missions = true;
    guards.getSession.mockResolvedValue(session("staff"));
    followUps.unlockAchievements.mockResolvedValue([]);
  });

  it("does nothing when check-ins are switched off", async () => {
    features.FEATURES.checkins = false;

    expect(await serveAttendeeAction(input)).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await serveAttendeeAction(input)).toEqual({ ok: false, code: "unauthenticated" });
    expect(checkpointsServer.serveAttendee).not.toHaveBeenCalled();
  });

  it.each(["attendee", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await serveAttendeeAction(input)).toEqual({ ok: false, code: "forbidden" });
    expect(checkpointsServer.serveAttendee).not.toHaveBeenCalled();
  });

  it.each([
    [{ checkpointId: "", payload: "x" }],
    [{ checkpointId: "x".repeat(49), payload: "x" }],
    [{ checkpointId: "lunch-1", payload: "" }],
    [{ checkpointId: "lunch-1", payload: "x".repeat(513) }],
    [{ checkpointId: 5, payload: "x" } as unknown as typeof input],
    [undefined as unknown as typeof input],
  ])("rejects input that cannot be a pass (%j) before touching the use case", async (bad) => {
    expect(await serveAttendeeAction(bad)).toEqual({ ok: false, code: "invalid-code" });
    expect(checkpointsServer.serveAttendee).not.toHaveBeenCalled();
  });

  it("lets staff and admin through, using the actor from the session", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({
      ok: true,
      value: { uid: "cadet-1", kind: "catering", status: "served", firstEntrance: false, alias: "Nova_7", squadId: "gemini", servedCount: 7 },
    });

    for (const role of ["staff", "admin"] as const) {
      guards.getSession.mockResolvedValue(session(role));
      // The scanned cadet's uid stays on the server.
      expect(await serveAttendeeAction(input)).toEqual({
        ok: true,
        kind: "catering",
        status: "served",
        firstEntrance: false,
        alias: "Nova_7",
        squadId: "gemini",
        servedCount: 7,
        missions: [],
      });
      expect(checkpointsServer.serveAttendee).toHaveBeenLastCalledWith({ marker: "deps" }, { uid: "s1", role, kinds: role === "staff" ? ["entrance", "catering", "stand"] : undefined }, input);
    }
  });

  it("maps a use case failure to its code only", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({ ok: false, error: { code: "expired-code" } });

    expect(await serveAttendeeAction(input)).toEqual({ ok: false, code: "expired-code" });
  });

  it("says what a person lacks for the meal, so the staff can tell them", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({ ok: false, error: { code: "not-eligible", missing: { level: 2, talks: 1 } } });

    expect(await serveAttendeeAction(input)).toEqual({ ok: false, code: "not-eligible", missing: { level: 2, levelName: "Piloto", talks: 1 } });
    expect(foodGate.describeShortfall).toHaveBeenCalledWith({ level: 2, talks: 1 });
  });

  it("completes the stand's missions for the scanned cadet and unlocks their achievements", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({
      ok: true,
      value: { uid: "cadet-1", kind: "stand", status: "served", firstEntrance: false, alias: "Nova_7", squadId: null, servedCount: 3 },
    });
    followUps.completeByCheckpoint.mockResolvedValue({ ok: true, value: [{ title: "Visita Cloud", xpEarned: 30, creditsEarned: 5, justCompleted: true }] });

    const result = await serveAttendeeAction({ checkpointId: "stand-cloud", payload: "devfest:at:abc" });

    expect(result).toMatchObject({ ok: true, kind: "stand", missions: [{ title: "Visita Cloud", xpEarned: 30, justCompleted: true }] });
    expect(followUps.completeByCheckpoint).toHaveBeenCalledWith({ marker: "missions" }, "cadet-1", "stand-cloud");
    expect(followUps.unlockAchievements).toHaveBeenCalledWith("cadet-1");
  });

  it("retries the stand's rewards on a repeated visit (the steps are idempotent)", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({
      ok: true,
      value: { uid: "cadet-1", kind: "stand", status: "already-served", firstEntrance: false, alias: "Nova_7", squadId: null, servedCount: 3 },
    });
    followUps.completeByCheckpoint.mockResolvedValue({ ok: true, value: [] });

    await serveAttendeeAction({ checkpointId: "stand-cloud", payload: "devfest:at:abc" });

    expect(followUps.completeByCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("never completes missions at the entrance or the catering, nor with missions off, and a failed step never fails the scan", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({
      ok: true,
      value: { uid: "cadet-1", kind: "entrance", status: "served", firstEntrance: true, alias: "Nova_7", squadId: null, servedCount: 1 },
    });
    expect(await serveAttendeeAction(input)).toMatchObject({ ok: true, kind: "entrance", firstEntrance: true, missions: [] });
    expect(followUps.completeByCheckpoint).not.toHaveBeenCalled();
    expect(followUps.unlockAchievements).toHaveBeenCalledWith("cadet-1");

    features.FEATURES.missions = false;
    checkpointsServer.serveAttendee.mockResolvedValue({
      ok: true,
      value: { uid: "cadet-1", kind: "stand", status: "served", firstEntrance: false, alias: "Nova_7", squadId: null, servedCount: 1 },
    });
    expect(await serveAttendeeAction(input)).toMatchObject({ ok: true, missions: [] });
    expect(followUps.completeByCheckpoint).not.toHaveBeenCalled();

    features.FEATURES.missions = true;
    followUps.completeByCheckpoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await serveAttendeeAction(input)).toMatchObject({ ok: true, kind: "stand", missions: [] });
  });

  it("runs no follow-up when the scan was refused", async () => {
    checkpointsServer.serveAttendee.mockResolvedValue({ ok: false, error: { code: "invalid-code" } });

    await serveAttendeeAction(input);
    expect(followUps.completeByCheckpoint).not.toHaveBeenCalled();
    expect(followUps.unlockAchievements).not.toHaveBeenCalled();
  });
});
