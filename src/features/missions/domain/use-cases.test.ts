import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Evaluation, MissionCompletion } from "./completion";
import type { Mission, MissionConfig } from "./mission";
import type { CompletionStore } from "./ports";
import { completeByCheckpoint, getMissionBoard, submitMissionProof, type SubmitProofDeps } from "./use-cases";

const mission = (id: string, config: MissionConfig, extra: Partial<Mission> = {}): Mission => ({
  id,
  title: id.toUpperCase(),
  description: "Descripción",
  quadrantId: "ai",
  xp: 40,
  order: 0,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config,
  ...extra,
});
const QUIZ = mission("quiz-1", { type: "quiz", question: "¿Q?", options: ["a", "b"], answer: 1 }, { order: 1 });
const KEYWORD = mission("kw-1", { type: "keyword", prompt: "Pide la clave", keywords: ["clave"] }, { order: 0 });
const STAND = mission("stand-1", { type: "stand", checkpointId: "stand-ai-1" }, { order: 2, xp: 30 });
const HIDDEN = mission("hidden-1", { type: "talk", checkpointId: "talk-1" }, { active: false });
const DEFAULT = mission("default-1", { type: "talk", checkpointId: "talk-keynote" });

/** A completion store kept in memory that runs `decide` like the transaction does. */
function memoryCompletions(initial: MissionCompletion[] = []) {
  const rows = new Map(initial.map((row) => [`${row.uid}_${row.missionId}`, row]));
  const store: CompletionStore & { rows: typeof rows } = {
    rows,
    listFor: vi.fn(async (uid: string) => ok([...rows.values()].filter((row) => row.uid === uid))),
    apply: vi.fn(async (uid: string, missionId: string, decide: (previous: MissionCompletion | null) => Evaluation) => {
      const before = rows.get(`${uid}_${missionId}`) ?? null;
      const evaluation = decide(before);
      if (evaluation.kind !== "next") return ok({ before, evaluation, after: before });
      const after: MissionCompletion = { uid, missionId, status: evaluation.status, attempts: evaluation.attempts, xpEarned: evaluation.xpEarned, creditsEarned: evaluation.creditsEarned, at: new Date(0) };
      rows.set(`${uid}_${missionId}`, after);
      return ok({ before, evaluation, after });
    }),
  };
  return store;
}

function setup({ stored = [QUIZ, KEYWORD, STAND, HIDDEN], completions = [] as MissionCompletion[] } = {}) {
  const paid = new Set<string>();
  const xp = {
    grant: vi.fn(async ({ uid, source, xp }: { uid: string; source: `mission:${string}`; xp: number; credits: number }): Promise<Result<{ granted: boolean; total: number }, { code: string }>> => {
      const key = `${uid}_${source}`;
      if (paid.has(key)) return ok({ granted: false, total: xp });
      paid.add(key);
      return ok({ granted: true, total: xp });
    }),
  };
  const deps = {
    source: { list: vi.fn(async (): Promise<Result<readonly Mission[], { code: string }>> => ok(stored)) },
    completions: memoryCompletions(completions),
    defaults: [DEFAULT],
    xp,
    limiter: { consume: vi.fn(async () => true) },
  } satisfies SubmitProofDeps;
  return { deps, xp };
}

const row = (missionId: string, status: MissionCompletion["status"], attempts = 0, xpEarned = 0): MissionCompletion => ({
  uid: "u1",
  missionId,
  status,
  attempts,
  xpEarned,
  creditsEarned: 0,
  at: new Date(0),
});

describe("getMissionBoard", () => {
  it("says which mini-game each mission offers, or none", async () => {
    const { deps } = setup({ stored: [{ ...QUIZ, minigame: "circuits", minigameDifficulty: "hard" }, KEYWORD] });

    const board = await getMissionBoard(deps, "u1");

    expect(board.ok && board.value.missions.map((m) => [m.id, m.minigame])).toEqual([
      ["kw-1", null],
      ["quiz-1", "circuits"],
    ]);
  });

  it("lists the active missions in order with what the attendee did, and never the answers", async () => {
    const { deps } = setup({ completions: [row("quiz-1", "in-progress", 1), row("kw-1", "completed", 3, 40), { ...row("stand-1", "completed", 0, 30), uid: "other" }] });

    const board = await getMissionBoard(deps, "u1");

    expect(board.ok && board.value.missions.map((m) => [m.id, m.status, m.xpEarned, m.attemptsLeft])).toEqual([
      ["kw-1", "completed", 40, null],
      ["quiz-1", "in-progress", 0, 1],
      ["stand-1", "open", 0, null],
    ]);
    expect(board.ok && board.value.missions[1].config).toEqual({ type: "quiz", question: "¿Q?", options: ["a", "b"] });
    expect(JSON.stringify(board)).not.toContain("answer");
    expect(JSON.stringify(board)).not.toContain('"clave"');
    expect(board.ok && [board.value.completed, board.value.total, board.value.xpEarned]).toEqual([1, 3, 40]);
  });

  it("serves the bundled missions while the edition has none", async () => {
    const { deps } = setup({ stored: [] });

    const board = await getMissionBoard(deps, "u1");

    expect(board.ok && board.value.missions.map((m) => m.id)).toEqual(["default-1"]);
  });

  it("orders ties by title", async () => {
    const { deps } = setup({ stored: [mission("zz-1", STAND.config, { order: 5, title: "Zeta" }), mission("aa-1", STAND.config, { order: 5, title: "Alfa" })] });

    const board = await getMissionBoard(deps, "u1");

    expect(board.ok && board.value.missions.map((m) => m.id)).toEqual(["aa-1", "zz-1"]);
  });

  it("reports a failed read of the missions or of the completions", async () => {
    const failedMissions = setup();
    failedMissions.deps.source.list.mockResolvedValue(err({ code: "x" }));
    const failedCompletions = setup();
    vi.mocked(failedCompletions.deps.completions.listFor).mockResolvedValue(err({ code: "x" }));

    expect(await getMissionBoard(failedMissions.deps, "u1")).toEqual(err({ code: "unknown" }));
    expect(await getMissionBoard(failedCompletions.deps, "u1")).toEqual(err({ code: "unknown" }));
  });
});

describe("submitMissionProof", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("completes a quiz on the first try and pays its XP through the ledger, once", async () => {
    const result = await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 1 });

    expect(result).toEqual(ok({ kind: "answered", status: "completed", xpEarned: 40, creditsEarned: 0, attemptsLeft: 0 }));
    expect(ctx.xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:quiz-1", xp: 40, credits: 0 });
  });

  it("keeps a wrong first answer without paying, then pays half on a right second answer", async () => {
    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 0 })).toEqual(
      ok({ kind: "answered", status: "in-progress", xpEarned: 0, creditsEarned: 0, attemptsLeft: 1 }),
    );
    expect(ctx.xp.grant).not.toHaveBeenCalled();

    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(
      ok({ kind: "answered", status: "completed", xpEarned: 20, creditsEarned: 0, attemptsLeft: 0 }),
    );
    expect(ctx.xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:quiz-1", xp: 20, credits: 0 });
  });

  it("closes a quiz after two wrong answers, and later answers change nothing", async () => {
    await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 0 });
    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 0 })).toEqual(
      ok({ kind: "answered", status: "failed", xpEarned: 0, creditsEarned: 0, attemptsLeft: 0 }),
    );

    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(ok({ kind: "closed", status: "failed", xpEarned: 0, creditsEarned: 0 }));
    expect(ctx.xp.grant).not.toHaveBeenCalled();
  });

  it("pays a completed mission that was not paid yet when it is answered again (a grant that failed is healed)", async () => {
    ctx.xp.grant.mockResolvedValueOnce(err({ code: "unknown" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await submitMissionProof(ctx.deps, "u1", "kw-1", { kind: "keyword", value: "Clave" })).toEqual(err({ code: "unknown" }));
    expect(ctx.deps.completions.rows.get("u1_kw-1")?.status).toBe("completed");

    expect(await submitMissionProof(ctx.deps, "u1", "kw-1", { kind: "keyword", value: "clave" })).toEqual(ok({ kind: "closed", status: "completed", xpEarned: 40, creditsEarned: 0 }));
    expect(ctx.xp.grant).toHaveBeenCalledTimes(2);
    expect(ctx.xp.grant).toHaveBeenLastCalledWith({ uid: "u1", source: "mission:kw-1", xp: 40, credits: 0 });
  });

  it("never pays a mission that was not completed, even if its record claims XP", async () => {
    const odd = setup({ completions: [row("quiz-1", "failed", 2, 40)] });

    expect(await submitMissionProof(odd.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(ok({ kind: "closed", status: "failed", xpEarned: 40, creditsEarned: 0 }));
    expect(odd.xp.grant).not.toHaveBeenCalled();
  });

  it("tells an attendee without a profile in this edition to register", async () => {
    ctx.xp.grant.mockResolvedValue(err({ code: "not-registered" }));

    expect(await submitMissionProof(ctx.deps, "u1", "stand-1", { kind: "checkpoint", checkpointId: "stand-ai-1" })).toEqual(err({ code: "not-registered" }));
  });

  it("limits typed answers, but not verified scans", async () => {
    ctx.deps.limiter.consume.mockResolvedValue(false);

    expect(await submitMissionProof(ctx.deps, "u1", "kw-1", { kind: "keyword", value: "x" })).toEqual(err({ code: "rate-limited" }));
    expect(ctx.deps.completions.apply).not.toHaveBeenCalled();
    expect(await submitMissionProof(ctx.deps, "u1", "stand-1", { kind: "checkpoint", checkpointId: "stand-ai-1" })).toMatchObject({ ok: true });
  });

  it("refuses unknown and inactive missions, and proofs of the wrong kind", async () => {
    expect(await submitMissionProof(ctx.deps, "u1", "nope", { kind: "choice", option: 0 })).toEqual(err({ code: "not-found" }));
    expect(await submitMissionProof(ctx.deps, "u1", "hidden-1", { kind: "checkpoint", checkpointId: "talk-1" })).toEqual(err({ code: "inactive" }));
    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "keyword", value: "b" })).toEqual(err({ code: "wrong-proof" }));
  });

  it("answers the bundled missions while the edition has none", async () => {
    const empty = setup({ stored: [] });

    expect(await submitMissionProof(empty.deps, "u1", "default-1", { kind: "checkpoint", checkpointId: "talk-keynote" })).toMatchObject({ ok: true });
  });

  it("reports failures to read the missions or to store the answer", async () => {
    ctx.deps.source.list.mockResolvedValueOnce(err({ code: "x" }));
    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(err({ code: "unknown" }));

    vi.mocked(ctx.deps.completions.apply).mockResolvedValueOnce(err({ code: "x" }));
    expect(await submitMissionProof(ctx.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(err({ code: "unknown" }));
    expect(ctx.xp.grant).not.toHaveBeenCalled();
  });

  it("does not pay a mission completed with no XP (half of 1)", async () => {
    const tiny = setup({ stored: [{ ...QUIZ, xp: 1 }], completions: [row("quiz-1", "in-progress", 1)] });

    expect(await submitMissionProof(tiny.deps, "u1", "quiz-1", { kind: "choice", option: 1 })).toEqual(
      ok({ kind: "answered", status: "completed", xpEarned: 0, creditsEarned: 0, attemptsLeft: 0 }),
    );
    expect(tiny.xp.grant).not.toHaveBeenCalled();
  });
});

describe("G-Credits", () => {
  const rules = { creditsFor: vi.fn(async (type: string, own: number | null) => (own ?? (type === "stand" ? 10 : 5))) };

  it("shows each mission's credits on the board and adds up what was earned", async () => {
    const ctx = setup({ stored: [QUIZ, { ...STAND, credits: 25 }], completions: [{ ...row("stand-1", "completed", 0, 30), creditsEarned: 25 }] });

    const board = await getMissionBoard({ ...ctx.deps, credits: rules }, "u1");

    expect(board.ok && board.value.missions.map((m) => [m.id, m.credits, m.creditsEarned])).toEqual([
      ["quiz-1", 5, 0],
      ["stand-1", 25, 25],
    ]);
    expect(board.ok && board.value.creditsEarned).toBe(25);
    expect(rules.creditsFor).toHaveBeenCalledWith("stand", 25);
  });

  it("pays a mission's credits with its XP, shared like the XP on a second try", async () => {
    const ctx = setup({ completions: [row("quiz-1", "in-progress", 1)] });

    const result = await submitMissionProof({ ...ctx.deps, credits: rules }, "u1", "quiz-1", { kind: "choice", option: 1 });

    expect(result).toEqual(ok({ kind: "answered", status: "completed", xpEarned: 20, creditsEarned: 2, attemptsLeft: 0 }));
    expect(ctx.xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:quiz-1", xp: 20, credits: 2 });
  });

  it("gives no credits without the economy, and still pays a mission worth only credits", async () => {
    const plain = setup();
    expect(await getMissionBoard(plain.deps, "u1")).toMatchObject({ ok: true, value: { creditsEarned: 0 } });

    const creditsOnly = setup({ stored: [{ ...STAND, xp: 1 }], completions: [] });
    creditsOnly.deps.completions.rows.set("u1_stand-1", { ...row("stand-1", "completed", 0, 0), creditsEarned: 10 });
    await submitMissionProof({ ...creditsOnly.deps, credits: rules }, "u1", "stand-1", { kind: "checkpoint", checkpointId: "stand-ai-1" });
    expect(creditsOnly.xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:stand-1", xp: 0, credits: 10 });
  });
});

describe("completeByCheckpoint", () => {
  const TALK_A = mission("talk-a", { type: "talk", checkpointId: "talk-keynote" }, { order: 2, title: "Charla A" });
  const TALK_B = mission("talk-b", { type: "talk", checkpointId: "talk-keynote" }, { order: 1, title: "Charla B", xp: 50 });
  const OFF = mission("talk-off", { type: "talk", checkpointId: "talk-keynote" }, { active: false });
  const OTHER = mission("stand-x", { type: "stand", checkpointId: "stand-x" });
  // A keyword that happens to equal the checkpoint id is not a scan mission.
  const TRAP = mission("kw-trap", { type: "keyword", prompt: "Pide la clave", keywords: ["talk-keynote"] });

  it("completes every active scan mission of that checkpoint, in order, and pays each", async () => {
    const { deps, xp } = setup({ stored: [TALK_A, TALK_B, OFF, OTHER, TRAP] });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await completeByCheckpoint(deps, "u1", "talk-keynote");

    expect(result).toEqual(
      ok([
        { id: "talk-b", title: "Charla B", xpEarned: 50, creditsEarned: 0, justCompleted: true },
        { id: "talk-a", title: "Charla A", xpEarned: 40, creditsEarned: 0, justCompleted: true },
      ]),
    );
    expect(xp.grant).toHaveBeenCalledTimes(2);
    // Missions of other checkpoints and inactive ones are not even tried (a try would be refused and logged).
    expect(deps.completions.apply).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
  });

  it("reports missions done before as already completed, without new XP", async () => {
    const { deps, xp } = setup({ stored: [TALK_A], completions: [row("talk-a", "completed", 0, 40)] });

    expect(await completeByCheckpoint(deps, "u1", "talk-keynote")).toEqual(ok([{ id: "talk-a", title: "Charla A", xpEarned: 40, creditsEarned: 0, justCompleted: false }]));
    expect(xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:talk-a", xp: 40, credits: 0 });
  });

  it("returns nothing for a checkpoint without missions", async () => {
    const { deps } = setup({ stored: [TALK_A] });

    expect(await completeByCheckpoint(deps, "u1", "catering-lunch")).toEqual(ok([]));
  });

  it("skips (and logs) a mission that fails, keeping the others", async () => {
    const { deps } = setup({ stored: [TALK_A, TALK_B] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(deps.completions.apply).mockResolvedValueOnce(err({ code: "x" }));

    expect(await completeByCheckpoint(deps, "u1", "talk-keynote")).toEqual(ok([{ id: "talk-a", title: "Charla A", xpEarned: 40, creditsEarned: 0, justCompleted: true }]));
    expect(console.error).toHaveBeenCalled();
  });

  it("stops at an attendee without a profile in this edition", async () => {
    const { deps, xp } = setup({ stored: [TALK_A, TALK_B] });
    xp.grant.mockResolvedValue(err({ code: "not-registered" }));

    expect(await completeByCheckpoint(deps, "u1", "talk-keynote")).toEqual(err({ code: "not-registered" }));
  });

  it("reports a failed read of the missions", async () => {
    const { deps } = setup();
    deps.source.list.mockResolvedValue(err({ code: "x" }));

    expect(await completeByCheckpoint(deps, "u1", "talk-keynote")).toEqual(err({ code: "unknown" }));
  });
});