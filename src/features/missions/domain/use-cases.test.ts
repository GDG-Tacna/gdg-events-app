import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Evaluation, MissionCompletion } from "./completion";
import type { Mission, MissionConfig } from "./mission";
import type { CompletionStore } from "./ports";
import { completeByCheckpoint, completeBySpeaker, completeBySquads, completeByTeam, getMissionBoard, submitMissionProof, type SubmitProofDeps } from "./use-cases";

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

  it("shows no missions while the edition has none (the bundled set is only loaded by an admin)", async () => {
    const { deps } = setup({ stored: [] });

    const board = await getMissionBoard(deps, "u1");

    expect(board.ok && board.value.missions).toEqual([]);
    expect(board.ok && board.value.total).toBe(0);
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

  it("answers no mission while the edition has none", async () => {
    const empty = setup({ stored: [] });

    expect(await submitMissionProof(empty.deps, "u1", "talk-keynote", { kind: "checkpoint", checkpointId: "talk-keynote" })).toEqual(err({ code: "not-found" }));
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
describe("completeBySpeaker", () => {
  const MEET_A = mission("meet-a", { type: "speaker", speakerIds: ["ana-torres"] }, { order: 2, title: "Conoce a Ana" });
  const MEET_B = mission("meet-b", { type: "speaker", speakerIds: ["ana-torres"] }, { order: 1, title: "Pregúntale a Ana", xp: 60 });
  const MEET_OFF = mission("meet-off", { type: "speaker", speakerIds: ["ana-torres"] }, { active: false });
  const OTHER = mission("meet-luis", { type: "speaker", speakerIds: ["luis"] });
  // A stand whose checkpoint id equals the speaker id is not completed by the speaker's code.
  const LOOKALIKE = mission("stand-ana", { type: "stand", checkpointId: "ana-torres" });

  it("completes every active mission of that speaker, in order, without spending the typed-answer limiter", async () => {
    const { deps, xp } = setup({ stored: [MEET_A, MEET_B, MEET_OFF, OTHER, LOOKALIKE] });

    expect(await completeBySpeaker(deps, "u1", "ana-torres")).toEqual(
      ok([
        { id: "meet-b", title: "Pregúntale a Ana", xpEarned: 60, creditsEarned: 0, justCompleted: true },
        { id: "meet-a", title: "Conoce a Ana", xpEarned: 40, creditsEarned: 0, justCompleted: true },
      ]),
    );
    expect(xp.grant).toHaveBeenCalledTimes(2);
    expect(deps.limiter.consume).not.toHaveBeenCalled();
  });

  it("reports a mission done before as already completed, and nothing for a speaker without missions", async () => {
    const { deps } = setup({ stored: [MEET_A], completions: [row("meet-a", "completed", 0, 40)] });

    expect(await completeBySpeaker(deps, "u1", "ana-torres")).toEqual(ok([{ id: "meet-a", title: "Conoce a Ana", xpEarned: 40, creditsEarned: 0, justCompleted: false }]));
    expect(await completeBySpeaker(deps, "u1", "zoe")).toEqual(ok([]));
  });
});

describe("completeBySpeaker: missions that name several speakers", () => {
  const SOME = mission("meet-some", { type: "speaker", speakerIds: ["ana-torres", "luis"] }, { order: 1, title: "Conoce a Ana o a Luis" });

  it("completes it with the code of any one of the chosen speakers, and with nobody else's", async () => {
    const { deps, xp } = setup({ stored: [SOME] });

    expect(await completeBySpeaker(deps, "u1", "zoe")).toEqual(ok([]));
    expect(xp.grant).not.toHaveBeenCalled();
    expect(await completeBySpeaker(deps, "u1", "luis")).toEqual(ok([{ id: "meet-some", title: "Conoce a Ana o a Luis", xpEarned: 40, creditsEarned: 0, justCompleted: true }]));
    expect(await completeBySpeaker(deps, "u2", "ana-torres")).toEqual(ok([{ id: "meet-some", title: "Conoce a Ana o a Luis", xpEarned: 40, creditsEarned: 0, justCompleted: true }]));
  });

  it("completes it once, however many of the chosen speakers the cadet meets", async () => {
    const { deps, xp } = setup({ stored: [SOME] });

    await completeBySpeaker(deps, "u1", "ana-torres");
    const again = await completeBySpeaker(deps, "u1", "luis");

    expect(again).toEqual(ok([{ id: "meet-some", title: "Conoce a Ana o a Luis", xpEarned: 40, creditsEarned: 0, justCompleted: false }]));
    expect(await xp.grant.mock.results[1].value).toEqual(ok({ granted: false, total: 40 }));
  });
});

describe("completeBySpeaker: missions that accept every speaker", () => {
  const ANY = mission("meet-any", { type: "speaker", speakerIds: null }, { order: 0, title: "Conoce a un speaker" });
  const ANA = mission("meet-ana", { type: "speaker", speakerIds: ["ana-torres"] }, { order: 1, title: "Conoce a Ana" });

  it("completes the any-speaker mission with the code of whichever speaker was scanned, next to that speaker's own", async () => {
    const { deps, xp } = setup({ stored: [ANY, ANA] });

    expect(await completeBySpeaker(deps, "u1", "ana-torres")).toEqual(
      ok([
        { id: "meet-any", title: "Conoce a un speaker", xpEarned: 40, creditsEarned: 0, justCompleted: true },
        { id: "meet-ana", title: "Conoce a Ana", xpEarned: 40, creditsEarned: 0, justCompleted: true },
      ]),
    );
    expect(await completeBySpeaker(deps, "u2", "luis")).toEqual(ok([{ id: "meet-any", title: "Conoce a un speaker", xpEarned: 40, creditsEarned: 0, justCompleted: true }]));
    expect(xp.grant).toHaveBeenCalledTimes(3);
  });

  it("completes it once, however many speakers the cadet meets", async () => {
    const { deps, xp } = setup({ stored: [ANY] });

    await completeBySpeaker(deps, "u1", "ana-torres");
    const again = await completeBySpeaker(deps, "u1", "luis");

    expect(again).toEqual(ok([{ id: "meet-any", title: "Conoce a un speaker", xpEarned: 40, creditsEarned: 0, justCompleted: false }]));
    // The second call only re-asked the ledger, which pays a source once.
    expect(await xp.grant.mock.results[1].value).toEqual(ok({ granted: false, total: 40 }));
  });
});

describe("completeByTeam", () => {
  const ORGANIZER = mission("meet-organizer", { type: "team", role: "organizer", memberUids: null }, { order: 1, title: "Conoce a un organizador", xp: 30 });
  const VOLUNTEER = mission("meet-volunteer", { type: "team", role: "volunteer", memberUids: null }, { order: 2, title: "Conoce a un voluntario", xp: 30 });
  const VOLUNTEER_OFF = mission("meet-volunteer-off", { type: "team", role: "volunteer", memberUids: null }, { active: false });
  const VOLUNTEER_CHOSEN = mission("meet-ana-or-bruno", { type: "team", role: "volunteer", memberUids: ["uid-ana-123", "uid-bruno-1"] }, { order: 3, title: "Conoce a Ana o a Bruno", xp: 30 });
  const ana = { role: "volunteer", memberUid: "uid-ana-123" } as const;
  const asVolunteer = { role: "volunteer", memberUid: "uid-zoe-1234" } as const;
  const asOrganizer = { role: "organizer", memberUid: "uid-zoe-1234" } as const;

  it("completes only the active missions of the scanned role, without spending the typed-answer limiter", async () => {
    const { deps, xp } = setup({ stored: [ORGANIZER, VOLUNTEER, VOLUNTEER_OFF] });

    expect(await completeByTeam(deps, "u1", asVolunteer)).toEqual(ok([{ id: "meet-volunteer", title: "Conoce a un voluntario", xpEarned: 30, creditsEarned: 0, justCompleted: true }]));
    expect(xp.grant).toHaveBeenCalledTimes(1);
    expect(xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:meet-volunteer", xp: 30, credits: 0 });
    expect(deps.limiter.consume).not.toHaveBeenCalled();
    expect(deps.completions.rows.has("u1_meet-organizer")).toBe(false);
  });

  it("reports a mission done before as already completed, and nothing for a role without missions", async () => {
    const { deps } = setup({ stored: [ORGANIZER], completions: [row("meet-organizer", "completed", 0, 30)] });

    expect(await completeByTeam(deps, "u1", asOrganizer)).toEqual(ok([{ id: "meet-organizer", title: "Conoce a un organizador", xpEarned: 30, creditsEarned: 0, justCompleted: false }]));
    expect(await completeByTeam(deps, "u1", asVolunteer)).toEqual(ok([]));
  });

  it("a mission that names members is completed only by one of them, next to the ones that accept every member", async () => {
    const { deps, xp } = setup({ stored: [VOLUNTEER, VOLUNTEER_CHOSEN] });

    // A volunteer who is not on the list completes the open mission only.
    expect(await completeByTeam(deps, "u1", asVolunteer)).toEqual(ok([{ id: "meet-volunteer", title: "Conoce a un voluntario", xpEarned: 30, creditsEarned: 0, justCompleted: true }]));
    expect(deps.completions.rows.has("u1_meet-ana-or-bruno")).toBe(false);
    // One who is on it completes both.
    expect(await completeByTeam(deps, "u2", ana)).toEqual(
      ok([
        { id: "meet-volunteer", title: "Conoce a un voluntario", xpEarned: 30, creditsEarned: 0, justCompleted: true },
        { id: "meet-ana-or-bruno", title: "Conoce a Ana o a Bruno", xpEarned: 30, creditsEarned: 0, justCompleted: true },
      ]),
    );
    expect(xp.grant).toHaveBeenCalledTimes(3);
    // The role still has to match: an organizer with the same uid is not a volunteer.
    expect(await completeByTeam(deps, "u3", { role: "organizer", memberUid: "uid-ana-123" })).toEqual(ok([]));
  });

  it("stops at an attendee without a profile in this edition", async () => {
    const { deps, xp } = setup({ stored: [ORGANIZER] });
    xp.grant.mockResolvedValueOnce(err({ code: "not-registered" }));

    expect(await completeByTeam(deps, "u1", asOrganizer)).toEqual(err({ code: "not-registered" }));
  });
});

type Progress = Result<{ met: readonly string[]; required: readonly string[] }, { code: string }>;
const progressOf = (met: readonly string[], required: readonly string[]) => vi.fn(async (): Promise<Progress> => ok({ met, required }));

describe("completeBySquads", () => {
  const SQUADS = mission("meet-squads", { type: "squads" }, { order: 1, title: "Conoce a cada escuadrón", xp: 60 });
  const SQUADS_OFF = mission("meet-squads-off", { type: "squads" }, { active: false });
  const withProgress = (base: ReturnType<typeof setup>["deps"], squadProgress: ReturnType<typeof progressOf>): SubmitProofDeps => ({ ...base, squadProgress });

  it("completes the mission once the cadet has met every required squad, and pays it", async () => {
    const { deps, xp } = setup({ stored: [SQUADS, SQUADS_OFF, QUIZ] });
    const squadProgress = progressOf(["firebase", "gemini"], ["firebase", "gemini"]);

    expect(await completeBySquads(withProgress(deps, squadProgress), "u1")).toEqual(ok([{ id: "meet-squads", title: "Conoce a cada escuadrón", xpEarned: 60, creditsEarned: 0, justCompleted: true }]));
    expect(xp.grant).toHaveBeenCalledWith({ uid: "u1", source: "mission:meet-squads", xp: 60, credits: 0 });
    expect(deps.limiter.consume).not.toHaveBeenCalled();
    expect(deps.completions.rows.has("u1_meet-squads-off")).toBe(false);
  });

  it("stores nothing while a squad is missing, so the mission stays open", async () => {
    const { deps, xp } = setup({ stored: [SQUADS] });

    expect(await completeBySquads(withProgress(deps, progressOf(["firebase"], ["firebase", "gemini"])), "u1")).toEqual(ok([]));
    expect(deps.completions.rows.size).toBe(0);
    expect(xp.grant).not.toHaveBeenCalled();
  });

  it("completes nothing for a cadet with no squad to meet", async () => {
    const { deps } = setup({ stored: [SQUADS] });

    expect(await completeBySquads(withProgress(deps, progressOf(["firebase"], [])), "u1")).toEqual(ok([]));
    expect(deps.completions.rows.size).toBe(0);
  });

  it("reads nothing more once the mission is completed, or when the edition has no active squads mission", async () => {
    const finished = setup({ stored: [SQUADS], completions: [row("meet-squads", "completed", 0, 60)] });
    const finishedProgress = progressOf(["firebase", "gemini"], ["firebase", "gemini"]);
    const none = setup({ stored: [QUIZ, SQUADS_OFF] });
    const noneProgress = progressOf(["firebase"], ["firebase"]);

    expect(await completeBySquads(withProgress(finished.deps, finishedProgress), "u1")).toEqual(ok([]));
    expect(await completeBySquads(withProgress(none.deps, noneProgress), "u1")).toEqual(ok([]));
    expect(finishedProgress).not.toHaveBeenCalled();
    expect(noneProgress).not.toHaveBeenCalled();
    expect(none.deps.completions.listFor).not.toHaveBeenCalled();
  });

  it("does nothing without a squad progress source, and reports a failed read of it", async () => {
    const { deps } = setup({ stored: [SQUADS] });
    const failing = vi.fn(async (): Promise<Progress> => err({ code: "unknown" }));

    expect(await completeBySquads(deps, "u1")).toEqual(ok([]));
    expect(await completeBySquads(withProgress(deps, failing), "u1")).toEqual(err({ code: "unknown" }));
  });
});

describe("getMissionBoard: squads progress", () => {
  const SQUADS = mission("meet-squads", { type: "squads" }, { title: "Conoce a cada escuadrón", order: 5 });

  it("shows how many of the other squads an open squads mission has met, counting only the required ones", async () => {
    const { deps } = setup({ stored: [SQUADS, KEYWORD] });
    const squadProgress = progressOf(["firebase", "angular", "retired"], ["firebase", "gemini"]);

    const board = await getMissionBoard({ ...deps, squadProgress }, "u1");

    expect(board.ok && board.value.missions.map((m) => [m.id, m.progress])).toEqual([
      ["kw-1", undefined],
      ["meet-squads", { done: 1, total: 2 }],
    ]);
    expect(squadProgress).toHaveBeenCalledTimes(1);
  });

  it("shows no progress once completed, with nothing required, or without a source, and reads nothing it does not need", async () => {
    const finished = setup({ stored: [SQUADS], completions: [row("meet-squads", "completed", 0, 40)] });
    const finishedProgress = progressOf(["firebase"], ["firebase"]);
    const nothing = setup({ stored: [SQUADS] });
    const without = setup({ stored: [SQUADS] });

    const a = await getMissionBoard({ ...finished.deps, squadProgress: finishedProgress }, "u1");
    const b = await getMissionBoard({ ...nothing.deps, squadProgress: progressOf(["firebase"], []) }, "u1");
    const c = await getMissionBoard(without.deps, "u1");

    expect(a.ok && a.value.missions[0].progress).toBeUndefined();
    expect(b.ok && b.value.missions[0].progress).toBeUndefined();
    expect(c.ok && c.value.missions[0].progress).toBeUndefined();
    expect(finishedProgress).not.toHaveBeenCalled();
  });

  it("still shows the board when the squad progress cannot be read", async () => {
    const { deps } = setup({ stored: [SQUADS] });
    const failing = vi.fn(async (): Promise<Progress> => err({ code: "unknown" }));

    const board = await getMissionBoard({ ...deps, squadProgress: failing }, "u1");

    expect(board.ok && board.value.missions.map((m) => [m.id, m.status, m.progress])).toEqual([["meet-squads", "open", undefined]]);
  });
});
