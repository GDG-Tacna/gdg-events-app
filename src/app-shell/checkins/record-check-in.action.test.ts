import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const checkIns = vi.hoisted(() => ({ checkInDeps: { marker: "deps", limiter: { consume: vi.fn() } } }));
vi.mock("@/app-shell/composition/checkins.server", () => checkIns);
const speakers = vi.hoisted(() => ({ speakerCodeDeps: { marker: "speaker-codes", speakers: { find: vi.fn() } } }));
vi.mock("@/app-shell/composition/speakers.server", () => speakers);
const speakersServer = vi.hoisted(() => ({ verifySpeakerCode: vi.fn() }));
vi.mock("@/features/speakers/server", () => speakersServer);
const teamCodes = vi.hoisted(() => ({ teamCodeDeps: { marker: "team-codes" } }));
vi.mock("@/app-shell/composition/team-code.server", () => teamCodes);
const teamServer = vi.hoisted(() => ({ verifyTeamCode: vi.fn() }));
vi.mock("@/features/team-code/server", () => teamServer);
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
const achievements = vi.hoisted(() => ({ unlockAchievements: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => achievements);
const economy = { currentEconomy: vi.fn(), rewardLedger: { marker: "ledger" } };
vi.mock("@/app-shell/composition/economy.server", () => economy);
const economyServer = { rewardTalk: vi.fn() };
vi.mock("@/features/economy/server", () => economyServer);

const missionsServer = { completeByCheckpoint: vi.fn(), completeBySpeaker: vi.fn(), completeByTeam: vi.fn() };
vi.mock("@/features/missions/server", () => missionsServer);

const guards = { getCadetSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const checkinsServer = { recordCheckIn: vi.fn() };
vi.mock("@/features/checkins/server", () => checkinsServer);

const attendee = vi.hoisted(() => ({ attendeeDeps: { attendees: { findByUid: vi.fn() } } }));
vi.mock("@/app-shell/composition/attendee.server", () => attendee);
const dashboard = vi.hoisted(() => ({ dashboardDeps: { ranks: vi.fn() } }));
vi.mock("@/app-shell/composition/dashboard.server", () => dashboard);

const network = vi.hoisted(() => ({ connectContactAction: vi.fn() }));
vi.mock("@/app-shell/network/network.actions", () => network);

const features = vi.hoisted(() => ({ FEATURES: { checkins: true, missions: true, network: true } }));
vi.mock("@/shared/config/features", () => features);

const { RANKS } = await import("@/features/attendee");
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
    guards.getCadetSession.mockResolvedValue(session("attendee"));
    // The cadet's profile after the scan: 120 XP, the second rank of the bundled ladder.
    attendee.attendeeDeps.attendees.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 120 } });
    dashboard.dashboardDeps.ranks.mockResolvedValue(RANKS);
  });

  it("does nothing when check-ins are switched off", async () => {
    features.FEATURES.checkins = false;

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "disabled" });
    expect(guards.getCadetSession).not.toHaveBeenCalled();
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getCadetSession.mockResolvedValue(null);

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "unauthenticated" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("sends a user without a profile back to onboarding", async () => {
    guards.getCadetSession.mockResolvedValue(session(null));

    expect(await recordCheckInAction("devfest:cp:talk-1")).toEqual({ ok: false, code: "not-registered" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it.each(["staff", "admin"] as const)("does not let %s accounts check in as attendees", async (role) => {
    guards.getCadetSession.mockResolvedValue(session(role));

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

  it("tells a cadet who scans another cadet's personal pass that the pass is for staff", async () => {
    expect(await recordCheckInAction("devfest:at:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, code: "pass-code" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("makes the contact for a cadet's contact code through the Red, never as a check-in", async () => {
    const card = { alias: "Bruno", squad: "Gemini", links: { linkedin: null, github: null, web: null } };
    network.connectContactAction.mockResolvedValue({ ok: true, card, created: true, xpEarned: 20, creditsEarned: 5, capReached: false, achievements: [{ id: "a", name: "Red", tone: "cyan" }] });

    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({
      ok: true,
      checkpointId: "contact",
      kind: "contact",
      recorded: true,
      firstEntrance: false,
      contact: { card, created: true, xpEarned: 20, creditsEarned: 5, capReached: false },
      missions: [],
      achievements: [{ id: "a", name: "Red", tone: "cyan" }],
      progress: expect.objectContaining({ xpGained: 20 }),
    });
    expect(network.connectContactAction).toHaveBeenCalledWith("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA");
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
  });

  it("hands the scanner the missions a contact completed (the squads mission), as it does for any scan", async () => {
    const card = { alias: "Bruno", squad: "Gemini", links: { linkedin: null, github: null, web: null } };
    const missions = [{ id: "meet-squads", title: "Conoce a cada escuadrón", xpEarned: 60, creditsEarned: 20, justCompleted: true }];
    network.connectContactAction.mockResolvedValue({ ok: true, card, created: true, xpEarned: 20, creditsEarned: 5, capReached: false, missions, achievements: [] });

    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toMatchObject({ ok: true, kind: "contact", missions });
  });

  it("answers a contact repeated as not recorded, and translates what the Red refuses", async () => {
    const card = { alias: "Bruno", squad: null, links: { linkedin: null, github: null, web: null } };
    network.connectContactAction.mockResolvedValueOnce({ ok: true, card, created: false, xpEarned: 0, creditsEarned: 0, capReached: false, achievements: [] });
    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toMatchObject({ ok: true, kind: "contact", recorded: false });

    for (const [refused, expected] of [["self", "own-contact-code"], ["unknown-cadet", "unknown-cadet"], ["expired-code", "expired-code"], ["invalid-github", "unknown"]] as const) {
      network.connectContactAction.mockResolvedValueOnce({ ok: false, code: refused });
      expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, code: expected });
    }
  });

  it("treats a contact code as any other code with the network off", async () => {
    features.FEATURES.network = false;
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: false, error: { code: "invalid-code" } });
    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, code: "invalid-code" });
    expect(network.connectContactAction).not.toHaveBeenCalled();
  });

  it("uses the uid of the session, never one from the client, and returns the result as plain data", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({
      ok: true,
      value: { checkpointId: "entrance-main", kind: "entrance", recorded: true, firstEntrance: true, checkpoint: { name: "Puerta norte", description: "Bienvenidos", image: "/media/door.webp" } },
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
      // The cadet sees the name, description and image of the place they scanned.
      checkpoint: { name: "Puerta norte", description: "Bienvenidos", image: "/media/door.webp" },
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
      missions: [{ id: "m-1", title: "Visita el stand", xpEarned: 30, creditsEarned: 10, justCompleted: true }],
      talkCredits: kind === "talk" ? 10 : 0,
      achievements: [],
      // 30 XP now: the bar moved, within the first rank (120 XP in the profile read here, so it crossed into the second).
      progress: expect.objectContaining({ xpGained: 30 }),
    });
  });

  it("says how the XP bar moved when the scan gave XP, and whether it crossed into a new rank", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "cp-1", kind: "stand", recorded: true, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({
      ok: true,
      value: [
        { id: "m-1", title: "Visita el stand", xpEarned: 30, creditsEarned: 0, justCompleted: true },
        // A mission already completed gave nothing now.
        { id: "m-2", title: "Otra", xpEarned: 50, creditsEarned: 0, justCompleted: false },
      ],
    });

    const result = await recordCheckInAction("devfest:eq:cp-1");

    // 120 XP now, 90 before: from the end of the first rank to the start of the second.
    expect(result).toMatchObject({
      ok: true,
      progress: { xpGained: 30, from: { percent: 90, level: 1, name: "Recluta" }, to: { percent: 5, level: 2, name: "Piloto" }, rankUp: true },
    });
    expect(attendee.attendeeDeps.attendees.findByUid).toHaveBeenCalledWith("u1");
  });

  it("reads nothing about the rank when the scan gave no XP, and leaves the bar out when it cannot be read", async () => {
    checkinsServer.recordCheckIn.mockResolvedValue({ ok: true, value: { checkpointId: "talk-1", kind: "talk", recorded: true, firstEntrance: false } });
    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: true, value: [] });
    const plain = await recordCheckInAction("devfest:eq:talk-1");
    expect(plain).not.toHaveProperty("progress");
    expect(attendee.attendeeDeps.attendees.findByUid).not.toHaveBeenCalled();

    missionsServer.completeByCheckpoint.mockResolvedValue({ ok: true, value: [{ id: "m-1", title: "Asiste", xpEarned: 35, creditsEarned: 0, justCompleted: true }] });
    attendee.attendeeDeps.attendees.findByUid.mockRejectedValueOnce(new Error("down"));
    expect(await recordCheckInAction("devfest:eq:talk-1")).toMatchObject({ ok: true, kind: "talk" });
    attendee.attendeeDeps.attendees.findByUid.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    expect(await recordCheckInAction("devfest:eq:talk-1")).not.toHaveProperty("progress");
  });

  it("also says how the bar moved after a contact that paid XP", async () => {
    network.connectContactAction.mockResolvedValue({
      ok: true,
      card: { alias: "Bruno", squad: null, links: { linkedin: null, github: null, web: null } },
      created: true,
      xpEarned: 20,
      creditsEarned: 5,
      capReached: false,
      achievements: [],
      missions: [],
    });

    expect(await recordCheckInAction("devfest:ct:uid-bruno.1.AAAAAAAAAAAAAAAAAAAA")).toMatchObject({ ok: true, kind: "contact", progress: { xpGained: 20 } });
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
    guards.getCadetSession.mockResolvedValue(session("attendee"));
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
      missions: [{ id: "meet-ana", title: "Conoce a Ana", xpEarned: 40, creditsEarned: 10, justCompleted: true }],
      talkCredits: 0,
      achievements: [],
    });
    expect(speakersServer.verifySpeakerCode).toHaveBeenCalledWith(speakers.speakerCodeDeps, CODE);
    expect(missionsServer.completeBySpeaker).toHaveBeenCalledWith({ marker: "missions" }, "u1", "ana-torres");
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
  });

  it("is only for cadets, and goes through the scan limiter", async () => {
    guards.getCadetSession.mockResolvedValue(session("staff"));
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "forbidden" });

    guards.getCadetSession.mockResolvedValue(session("attendee"));
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

  it("does not let the speaker complete the mission of meeting themselves", async () => {
    speakers.speakerCodeDeps.speakers.find.mockResolvedValueOnce({ ok: true, value: { ...ANA, uid: "u1" } });

    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "own-speaker-code" });
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

describe("recordCheckInAction with a team member's code", () => {
  const CODE = "devfest:tm:uid-staff-123456.volunteer.1800000000.sig_xxxxxxxxxxxxxxxx";

  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.checkins = true;
    features.FEATURES.missions = true;
    achievements.unlockAchievements.mockResolvedValue([]);
    guards.getCadetSession.mockResolvedValue(session("attendee"));
    checkIns.checkInDeps.limiter.consume.mockResolvedValue(true);
    teamServer.verifyTeamCode.mockReturnValue({ ok: true, uid: "uid-staff-123456", role: "volunteer" });
    missionsServer.completeByTeam.mockResolvedValue({ ok: true, value: [{ id: "meet-volunteer", title: "Conoce a un voluntario", xpEarned: 30, creditsEarned: 10, justCompleted: true }] });
  });

  it("completes the missions of the role the code carries, without recording a check-in", async () => {
    expect(await recordCheckInAction(CODE)).toEqual({
      ok: true,
      checkpointId: "volunteer",
      kind: "team",
      recorded: true,
      firstEntrance: false,
      missions: [{ id: "meet-volunteer", title: "Conoce a un voluntario", xpEarned: 30, creditsEarned: 10, justCompleted: true }],
      talkCredits: 0,
      achievements: [],
    });
    expect(teamServer.verifyTeamCode).toHaveBeenCalledWith(teamCodes.teamCodeDeps, CODE);
    // The signed code says who showed it, so a mission that picks certain people can tell them apart.
    expect(missionsServer.completeByTeam).toHaveBeenCalledWith({ marker: "missions" }, "u1", { role: "volunteer", memberUid: "uid-staff-123456" });
    expect(checkinsServer.recordCheckIn).not.toHaveBeenCalled();
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
  });

  it("completes the organizer missions for an organizer's code", async () => {
    teamServer.verifyTeamCode.mockReturnValue({ ok: true, uid: "uid-admin-123456", role: "organizer" });

    expect(await recordCheckInAction("devfest:tm:uid-admin-123456.organizer.1800000000.sig_xxxxxxxxxxxxxxxx")).toMatchObject({ ok: true, kind: "team", checkpointId: "organizer" });
    expect(missionsServer.completeByTeam).toHaveBeenCalledWith({ marker: "missions" }, "u1", { role: "organizer", memberUid: "uid-admin-123456" });
  });

  it("is only for cadets, and goes through the scan limiter", async () => {
    guards.getCadetSession.mockResolvedValue(session("staff"));
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "forbidden" });

    guards.getCadetSession.mockResolvedValue(session("attendee"));
    checkIns.checkInDeps.limiter.consume.mockResolvedValue(false);
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "rate-limited" });
    expect(teamServer.verifyTeamCode).not.toHaveBeenCalled();
  });

  it("passes a bad or old code through and completes nothing", async () => {
    teamServer.verifyTeamCode.mockReturnValueOnce({ ok: false, code: "expired-code" });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "expired-code" });

    teamServer.verifyTeamCode.mockReturnValueOnce({ ok: false, code: "invalid-code" });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "invalid-code" });
    expect(missionsServer.completeByTeam).not.toHaveBeenCalled();
  });

  it("still answers the meeting when missions are off for the edition, and asks for a profile when there is none", async () => {
    features.FEATURES.missions = false;
    expect(await recordCheckInAction(CODE)).toMatchObject({ ok: true, kind: "team", missions: [] });
    expect(missionsServer.completeByTeam).not.toHaveBeenCalled();

    features.FEATURES.missions = true;
    missionsServer.completeByTeam.mockResolvedValueOnce({ ok: false, error: { code: "not-registered" } });
    expect(await recordCheckInAction(CODE)).toEqual({ ok: false, code: "not-registered" });
  });

  it("keeps the meeting when the missions fail for another reason", async () => {
    missionsServer.completeByTeam.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });

    expect(await recordCheckInAction(CODE)).toMatchObject({ ok: true, kind: "team", missions: [] });
  });
});
