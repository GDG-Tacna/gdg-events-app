import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
const achievements = vi.hoisted(() => ({ unlockAchievements: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => achievements);
const UNLOCKED = [{ id: "primer-salto", name: "Primer salto", tone: "cyan" }];
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { submitMissionProof: vi.fn() };
vi.mock("@/features/missions/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { missions: true } }));
vi.mock("@/shared/config/features", () => features);

const { submitMissionAnswerAction } = await import("./answer.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const QUIZ_ANSWER = { missionId: "ai-quiz", answer: { kind: "choice", option: 1 } };

describe("submitMissionAnswerAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.missions = true;
    guards.getSession.mockResolvedValue(session("attendee"));
    server.submitMissionProof.mockResolvedValue({ ok: true, value: { kind: "answered", status: "completed", xpEarned: 40, attemptsLeft: 0 } });
    achievements.unlockAchievements.mockResolvedValue(UNLOCKED);
  });

  it("does nothing when missions are switched off", async () => {
    features.FEATURES.missions = false;

    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it.each([
    [null, "unauthenticated"],
    [session(null), "not-registered"],
    [session("staff"), "forbidden"],
    [session("admin"), "forbidden"],
  ] as const)("refuses %j", async (who, code) => {
    guards.getSession.mockResolvedValue(who);

    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toEqual({ ok: false, code });
    expect(server.submitMissionProof).not.toHaveBeenCalled();
  });

  it.each([
    ["no mission", { answer: { kind: "choice", option: 0 } }],
    ["a scan sent as an answer", { missionId: "m", answer: { kind: "checkpoint", checkpointId: "stand-ai-1" } }],
    ["a negative option", { missionId: "m", answer: { kind: "choice", option: -1 } }],
    ["a fractional option", { missionId: "m", answer: { kind: "choice", option: 0.5 } }],
    ["an empty keyword", { missionId: "m", answer: { kind: "keyword", value: "   " } }],
    ["a keyword too long", { missionId: "m", answer: { kind: "keyword", value: "x".repeat(61) } }],
    ["not an object", "ai-quiz"],
  ])("rejects %s before touching the use case", async (_, input) => {
    expect(await submitMissionAnswerAction(input)).toEqual({ ok: false, code: "wrong-proof" });
    expect(server.submitMissionProof).not.toHaveBeenCalled();
  });

  it("answers for the attendee of the session and refreshes the board and the dashboard", async () => {
    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toEqual({ ok: true, status: "completed", xpEarned: 40, attemptsLeft: 0, closed: false, achievements: UNLOCKED });
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");

    expect(server.submitMissionProof).toHaveBeenCalledWith({ marker: "missions" }, "u1", "ai-quiz", { kind: "choice", option: 1 });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/missions");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("trims a keyword before sending it", async () => {
    await submitMissionAnswerAction({ missionId: "ai-kw", answer: { kind: "keyword", value: "  red neuronal " } });

    expect(server.submitMissionProof).toHaveBeenCalledWith({ marker: "missions" }, "u1", "ai-kw", { kind: "keyword", value: "red neuronal" });
  });

  it("says when the mission was already closed", async () => {
    server.submitMissionProof.mockResolvedValue({ ok: true, value: { kind: "closed", status: "failed", xpEarned: 0 } });

    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toEqual({ ok: true, status: "failed", xpEarned: 0, attemptsLeft: 0, closed: true, achievements: [] });
    // Nothing was completed: no badge to look for.
    expect(achievements.unlockAchievements).not.toHaveBeenCalled();
  });

  it("looks for badges again when the mission was already completed", async () => {
    server.submitMissionProof.mockResolvedValue({ ok: true, value: { kind: "closed", status: "completed", xpEarned: 40 } });

    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toMatchObject({ ok: true, closed: true, achievements: UNLOCKED });
  });

  it("maps a refusal to its code only", async () => {
    server.submitMissionProof.mockResolvedValue({ ok: false, error: { code: "rate-limited" } });

    expect(await submitMissionAnswerAction(QUIZ_ANSWER)).toEqual({ ok: false, code: "rate-limited" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
