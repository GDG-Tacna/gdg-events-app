import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const checkIns = vi.hoisted(() => ({ checkInDeps: { marker: "deps", limiter: { consume: vi.fn() } } }));
vi.mock("@/app-shell/composition/checkins.server", () => checkIns);
const speakers = vi.hoisted(() => ({ speakerCodeDeps: { marker: "speaker-codes", speakers: { find: vi.fn() } } }));
vi.mock("@/app-shell/composition/speakers.server", () => speakers);
const speakersServer = vi.hoisted(() => ({ verifySpeakerCode: vi.fn() }));
vi.mock("@/features/speakers/server", () => speakersServer);
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
const achievements = vi.hoisted(() => ({ unlockAchievements: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => achievements);
const economy = { currentEconomy: vi.fn(), rewardLedger: { marker: "ledger" } };
vi.mock("@/app-shell/composition/economy.server", () => economy);
const economyServer = { rewardTalk: vi.fn() };
vi.mock("@/features/economy/server", () => economyServer);

const missionsServer = { completeByCheckpoint: vi.fn(), completeBySpeaker: vi.fn() };
vi.mock("@/features/missions/server", () => missionsServer);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const checkinsServer = { recordCheckIn: vi.fn() };
vi.mock("@/features/checkins/server", () => checkinsServer);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true, missions: true, network: true } }));
vi.mock("@/shared/config/features", () => features);

const { recordCheckInAction } = await import("./record-check-in.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });

describe("recordCheckInAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    features.FEATURES.missions = true;
    features.FEATURES.network = true;
    economyServer.rewardTalk.mockResolvedValue({ ok: true, value: { credits: 10 } });
    achievements.unlockAchievements.mockResolvedValue([]);
    guards.getSession.mockResolvedValue(session("attendee"));
  });

  it("does nothing when check-ins are switched off", async () => {
    features.FEATURES.checkins = false;

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "unauthenticated" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("sends a user without a profile back to onboarding", async () => {
    guards.getSession.mockResolvedValue(session(null));

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "not-registered" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it.each(["staff", "admin"] as const)("does not let %s accounts check in as attendees", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "forbidden" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it.each([["" ], ["x".repeat(513)], [undefined as unknown as string], [42 as unknown as string]])(
    "rejects input that cannot be a QR payload before touching the use case (%#)",
    async (payload) => {
      expect(await recordCheckInAction(payload)).toEqual({ ok: false, code: "invalid-code" });
      expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
    },
  );

  it("points a cadet's contact code to the Red, or treats it as any other code with the network off", async () => {
    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, code: "contact-code" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();

    features.FEATURES.network = false;
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: false, error: { code: "invalid-code" } });
    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, code: "invalid-code" });
  });

  it("uses the uid of the session, never one from the client, and returns the result as plain data", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({
      ok: true,
      value: { checkpointId: "entrance-main", kind: "entrance", recorded: true, firstEntrance: true },
    });

    const result = await recordCheckInAction("devfest:cp:entrance-main");

    expect(checkinsServer.recordCheckIn).toHaveBeenCalledWith(
      checkIns.checkInDeps,
      { uid: "u1", payload: "devfest:cp:entrance-main" },
    );
    expect(result).toEqual({
      ok: true,
      checkpointId: "entrance-main",
      kind: "entrance",
      recorded: true,
      firstEntrance: true,
      missions: [],
      talkCredits: 0,
      achievements: [],
    });
    // An entrance completes no missions: they are not even looked up.
    expect(missionsServer.completeByCheckpoint).not.toHaveBeenCalled();
  });

  it("maps a use case failure to its code only", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: false, error: { code: "rate-limited" } });

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "rate-limited" });
  });

  it("passes on that staff scan a printed station code, with nothing else to do", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: false, error: { code: "staff-station" } });

    expect(await recordCheckInAction("devfest:cp:lunch-1")).toEqual({ ok: false, code: "staff-station" });
    expect(missionsServer.completeByCheckpoint).not.toHaveBeenCalled();
  });

  it.each(["talk", "stand"] as const)("completes the missions of a %s checkpoint and returns them with their XP", async (kind) => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "cp-1", kind, recorded: true, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({
      ok: true,
      value: [{ id: "m-1", title: "Visita el stand", xpEarned: 30, creditsEarned: 10, justCompleted: true }],
    });

    const result = await recordCheckInAction("devfest:cp:cp-1");

    expect(missionsServer.completeByCheckpoint).toHaveBeenCalledWith({ marker: "missions" }, "u1", "cp-1");
    expect(result).toEqual({
      ok: true,
      checkpointId: "cp-1",
      kind,
      recorded: true,
      firstEntrance: false,
      missions: [{ title: "Visita el stand", xpEarned: 30, creditsEarned: 10, justCompleted: true }],
      talkCredits: kind === "talk" ? 10 : 0,
      achievements: [],
    });
  });

  it("returns the badges the scan unlocked, looked for with the session's uid", async () => {
    const unlocked = [{ id: "oyente", name: "Oyente cósmico", tone: "violet" }];
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "talk-1", kind: "talk", recorded: true, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: true, value: [] });
    achievements.unlockAchievements.mockResolvedValue(unlocked);

    expect(await recordCheckInAction("devfest:eq:talk-1")).toMatchObject({ ok: true, achievements: unlocked });
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
  });

  it("does not look for badges after a refused scan", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: false, error: { code: "invalid-code" } });

    await recordCheckInAction("devfest:cp:nope");
    expect(achievements.unlockAchievements).not.toHaveBeenCalled();
  });

  it("also completes them on a repeated scan, so a failed grant is retried", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "cp-1", kind: "stand", recorded: false, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: true, value: [] });

    await recordCheckInAction("devfest:cp:cp-1");

    expect(missionsServer.completeByCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("keeps the check-in when the missions cannot be completed", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "cp-1", kind: "stand", recorded: true, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await recordCheckInAction("devfest:cp:cp-1")).toMatchObject({ ok: true, recorded: true, missions: [] });
  });

  it("leaves missions alone when they are switched off", async () => {
    features.FEATURES.missions = false;
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "cp-1", kind: "talk", recorded: true, firstEntrance: false } });

    expect(await recordCheckInAction("devfest:cp:cp-1")).toMatchObject({ ok: true, missions: [] });
    expect(missionsServer.completeByCheckpoint).not.toHaveBeenCalled();
  });

  it("pays the G-Credits of a talk with the session's uid, and none for other kinds", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "talk-keynote", kind: "talk", recorded: false, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: true, value: [] });

    expect(await recordCheckInAction("devfest:eq:x")).toMatchObject({ ok: true, talkCredits: 10 });
    expect(economyServer.rewardTalk).toHaveBeenCalledWith({ ledger: economy.rewardLedger, settings: economy.currentEconomy }, "u1", "talk-keynote");

    economyServer.rewardTalk.mockClear();
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "lunch", kind: "catering", recorded: true, firstEntrance: false } });
    expect(await recordCheckInAction("devfest:cp:lunch")).toMatchObject({ ok: true, talkCredits: 0 });
    expect(economyServer.rewardTalk).not.toHaveBeenCalled();
  });
});

describe("recordCheckInAction with a speaker's code", () => {
  const CODE = "devfest:sp:ana-torres.1800000000.sig_xxxxxxxxxxxxxxxx";
  const ANA = { id: "ana-torres", name: "Ana Torres", active: true, uid: null };

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    achievements.unlockAchievements.mockResolvedValue([]);
    guards.getSession.mockResolvedValue(session("attendee"));
    checkIns.checkInDeps.limiter.consume.mockResolvedValue(true);
    speakersServer.verifySpeakerCode.mockReturnValue({ ok: true, speakerId: "ana-torres" });
    speakers.speakerCodeDeps.speakers.find.mockResolvedValue({ ok: true, value: ANA });
    missionsServer.completeBySpeaker.mockResolvedValue({ ok: true, value: [{ id: "meet-ana", title: "Conoce a Ana", xpEarned: 40, creditsEarned: 10, justCompleted: true }] });
  });

  it("completes that speaker's missions without recording a check-in", async () => {
    expect(await recordCheckInAction(CODE)).toEqual({
      ok: true,
      checkpointId: "ana-torres",
      kind: "speaker",
      recorded: true,
      firstEntrance: false,
      missions: [{ title: "Conoce a Ana", xpEarned: 40, creditsEarned: 10, justCompleted: true }],
      talkCredits: 0,
      achievements: [],
    });
    expect(speakersServer.verifySpeakerCode).toHaveBeenCalledWith(speakers.speakerCodeDeps, CODE);
    expect(missionsServer.completeBySpeaker).toHaveBeenCalledWith({ marker: "missions" }, "u1", "ana-torres");
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
  });

  it("is only for cadets, and goes through the scan limiter", async () => {
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "forbidden" });

    guards.getSession.mockResolvedValue(session("attendee"));
    checkIns.checkInDeps.limiter.consume.mockResolvedValue(false);
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "rate-limited" });
    expect(speakersServer.verifySpeakerCode).not.toHaveBeenCalled();
  });

  it("passes a bad or old code through, and refuses a speaker no longer offered", async () => {
    speakersServer.verifySpeakerCode.mockReturnValueOnce({ ok: false, code: "expired-code" });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "expired-code" });

    speakers.speakerCodeDeps.speakers.find.mockResolvedValueOnce({ ok: true, value: { ...ANA, active: false } });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "speaker-inactive" });

    speakers.speakerCodeDeps.speakers.find.mockResolvedValueOnce({ ok: true, value: null });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "invalid-code" });
    expect(missionsServer.completeBySpeaker).not.toHaveBeenCalled();
  });

  it("still answers the meeting when missions are off for the edition, and asks for a profile when there is none", async () => {
    features.FEATURES.missions = false;
    expect(await recordCheckInAction(CODE)).toMatchObject({ ok: true, kind: "speaker", missions: [] });
    expect(missionsServer.completeBySpeaker).not.toHaveBeenCalled();

    features.FEATURES.missions = true;
    missionsServer.completeBySpeaker.mockResolvedValueOnce({ ok: false, error: { code: "not-registered" } });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "not-registered" });
  });
});
