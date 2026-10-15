import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { decideFinish, finishMinigame, getMinigameOffer, startMinigame, type MinigameDeps, type MinigamePlay, type MissionBonusInfo } from "./plays";
import { DEFAULT_MINIGAME_SETTINGS, type MinigameSettings } from "./settings";

const T0 = new Date("2026-10-24T15:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const MISSION: MissionBonusInfo = { minigame: "circuits", difficulty: null, active: true, completed: true, xpEarned: 40 };
const PLAY: MinigamePlay = { uid: "u1", missionId: "ai-quiz", gameId: "circuits", difficulty: "normal", status: "started", xpBonus: 40, startedAt: T0, expiresAt: at(170), finishedAt: null };

const settingsWith = (patch: Partial<MinigameSettings["games"]>): MinigameSettings => ({ ...DEFAULT_MINIGAME_SETTINGS, games: { ...DEFAULT_MINIGAME_SETTINGS.games, ...patch } });

interface Setup {
  info?: Result<MissionBonusInfo | null, { code: string }>;
  existing?: MinigamePlay | null;
  findFails?: boolean;
  settings?: MinigameSettings;
  grant?: Result<{ granted: boolean }, { code: string }>;
  now?: Date;
  startFails?: boolean;
  finishFails?: boolean;
}

function setup({ info = ok(MISSION), existing = null, findFails = false, settings = DEFAULT_MINIGAME_SETTINGS, grant = ok({ granted: true }), now = T0, startFails = false, finishFails = false }: Setup = {}) {
  let stored = existing;
  const deps: MinigameDeps = {
    plays: {
      find: vi.fn(async () => (findFails ? err({ code: "unknown" }) : ok(stored))),
      start: vi.fn(async (play: MinigamePlay) => {
        if (startFails) return err({ code: "unknown" });
        if (stored) return ok({ play: stored, created: false });
        stored = play;
        return ok({ play, created: true });
      }),
      finish: vi.fn(async (_uid: string, _missionId: string, decide: (current: MinigamePlay | null) => MinigamePlay | null) => {
        if (finishFails) return err({ code: "unknown" });
        const next = decide(stored);
        if (next) stored = next;
        return ok(stored);
      }),
    },
    missions: { bonusInfo: vi.fn(async () => info) },
    settings: vi.fn(async () => settings),
    ledger: { grant: vi.fn(async () => grant) },
    now: () => now,
  };
  return { deps, stored: () => stored };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("getMinigameOffer", () => {
  it("offers the mission's game at the edition's difficulty, with the XP a win pays", async () => {
    expect(await getMinigameOffer(setup().deps, "u1", "ai-quiz")).toEqual(ok({ gameId: "circuits", difficulty: "normal", state: "available", xpBonus: 40 }));
    expect(await getMinigameOffer(setup({ settings: settingsWith({ circuits: { enabled: true, difficulty: "hard" } }) }).deps, "u1", "ai-quiz")).toMatchObject({ value: { difficulty: "hard" } });
  });

  it("uses the mission's own difficulty when it has one", async () => {
    expect(await getMinigameOffer(setup({ info: ok({ ...MISSION, difficulty: "easy" }) }).deps, "u1", "ai-quiz")).toMatchObject({ value: { difficulty: "easy" } });
  });

  it.each<[string, Setup]>([
    ["no game", { info: ok({ ...MISSION, minigame: null }) }],
    ["an unknown game", { info: ok({ ...MISSION, minigame: "pong" }) }],
    ["a disabled game", { settings: settingsWith({ circuits: { enabled: false, difficulty: "normal" } }) }],
    ["a mission not completed", { info: ok({ ...MISSION, completed: false }) }],
    ["a mission that earned no XP", { info: ok({ ...MISSION, xpEarned: 0 }) }],
    ["an inactive mission", { info: ok({ ...MISSION, active: false }) }],
    ["an unknown mission", { info: ok(null) }],
  ])("offers nothing for %s", async (_case, overrides) => {
    expect(await getMinigameOffer(setup(overrides).deps, "u1", "ai-quiz")).toEqual(ok(null));
  });

  it("shows a play already made, even if the game was disabled since", async () => {
    const settings = settingsWith({ circuits: { enabled: false, difficulty: "normal" } });
    expect(await getMinigameOffer(setup({ existing: { ...PLAY, status: "won" }, settings }).deps, "u1", "ai-quiz")).toEqual(ok({ gameId: "circuits", difficulty: "normal", state: "won", xpBonus: 40 }));
    expect(await getMinigameOffer(setup({ existing: PLAY, now: at(10) }).deps, "u1", "ai-quiz")).toMatchObject({ value: { state: "in-play" } });
    expect(await getMinigameOffer(setup({ existing: PLAY, now: at(170) }).deps, "u1", "ai-quiz")).toMatchObject({ value: { state: "lost" } });
  });

  it("reports failed reads", async () => {
    expect(await getMinigameOffer(setup({ info: err({ code: "unknown" }) }).deps, "u1", "ai-quiz")).toEqual(err({ code: "unknown" }));
    expect(await getMinigameOffer(setup({ findFails: true }).deps, "u1", "ai-quiz")).toEqual(err({ code: "unknown" }));
  });
});

describe("startMinigame", () => {
  it("issues the single ticket, valid for the game's time limit plus two minutes", async () => {
    const t = setup({ settings: { ...settingsWith({ circuits: { enabled: true, difficulty: "easy" } }), codeLanguages: ["python"] } });

    expect(await startMinigame(t.deps, "u1", "ai-quiz")).toEqual(ok({ gameId: "circuits", difficulty: "easy", expiresAt: at(180), codeLanguages: ["python"] }));
    expect(t.stored()).toEqual({ ...PLAY, difficulty: "easy", expiresAt: at(180) });
  });

  it("hands the same ticket back on a reload while it is valid", async () => {
    const t = setup({ existing: PLAY, now: at(30) });

    expect(await startMinigame(t.deps, "u1", "ai-quiz")).toEqual(ok({ gameId: "circuits", difficulty: "normal", expiresAt: at(170), codeLanguages: ["javascript", "python"] }));
  });

  it("refuses a second attempt once the ticket is used or has expired", async () => {
    expect(await startMinigame(setup({ existing: { ...PLAY, status: "lost" } }).deps, "u1", "ai-quiz")).toEqual(err({ code: "already-played" }));
    expect(await startMinigame(setup({ existing: { ...PLAY, status: "won" } }).deps, "u1", "ai-quiz")).toEqual(err({ code: "already-played" }));
    expect(await startMinigame(setup({ existing: PLAY, now: at(170) }).deps, "u1", "ai-quiz")).toEqual(err({ code: "already-played" }));
  });

  it("refuses a mission that offers no game, and reports failures", async () => {
    const off = setup({ info: ok({ ...MISSION, completed: false }) });
    expect(await startMinigame(off.deps, "u1", "ai-quiz")).toEqual(err({ code: "not-available" }));
    expect(off.deps.plays.start).not.toHaveBeenCalled();
    expect(await startMinigame(setup({ info: err({ code: "unknown" }) }).deps, "u1", "ai-quiz")).toEqual(err({ code: "unknown" }));
    expect(await startMinigame(setup({ startFails: true }).deps, "u1", "ai-quiz")).toEqual(err({ code: "unknown" }));
  });
});

describe("decideFinish", () => {
  it("takes the phone's result within the ticket's time and after the game's minimum", () => {
    expect(decideFinish(PLAY, true, at(8))).toEqual({ ...PLAY, status: "won", finishedAt: at(8) });
    expect(decideFinish(PLAY, false, at(30))).toEqual({ ...PLAY, status: "lost", finishedAt: at(30) });
    expect(decideFinish(PLAY, true, at(170))).toMatchObject({ status: "won" });
  });

  it("counts a win sent too fast or after the ticket expired as lost", () => {
    expect(decideFinish(PLAY, true, at(7.9))).toMatchObject({ status: "lost" });
    expect(decideFinish(PLAY, true, at(170.5))).toMatchObject({ status: "lost" });
  });

  it("changes nothing without a ticket or once a play is finished", () => {
    expect(decideFinish(null, true, at(30))).toBeNull();
    expect(decideFinish({ ...PLAY, status: "lost" }, true, at(30))).toBeNull();
    expect(decideFinish({ ...PLAY, status: "won" }, false, at(30))).toBeNull();
  });
});

describe("finishMinigame", () => {
  it("pays a win through the ledger as the mission's mini-game source, XP only", async () => {
    const t = setup({ existing: PLAY, now: at(30) });

    expect(await finishMinigame(t.deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(ok({ status: "won", xpBonus: 40 }));
    expect(t.deps.ledger.grant).toHaveBeenCalledWith({ uid: "u1", source: "minigame:ai-quiz", xp: 40, credits: 0 });
    expect(t.stored()).toMatchObject({ status: "won", finishedAt: at(30) });
  });

  it("records a loss and pays nothing", async () => {
    const t = setup({ existing: PLAY, now: at(30) });

    expect(await finishMinigame(t.deps, "u1", { missionId: "ai-quiz", won: false })).toEqual(ok({ status: "lost", xpBonus: 0 }));
    expect(t.deps.ledger.grant).not.toHaveBeenCalled();
  });

  it("keeps the first result: a later one changes nothing, and a repeated win only retries the payment", async () => {
    const lost = setup({ existing: { ...PLAY, status: "lost", finishedAt: at(20) }, now: at(30) });
    expect(await finishMinigame(lost.deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(ok({ status: "lost", xpBonus: 0 }));
    expect(lost.deps.ledger.grant).not.toHaveBeenCalled();

    const won = setup({ existing: { ...PLAY, status: "won", finishedAt: at(20) }, now: at(30), grant: ok({ granted: false }) });
    expect(await finishMinigame(won.deps, "u1", { missionId: "ai-quiz", won: false })).toEqual(ok({ status: "won", xpBonus: 40 }));
    expect(won.deps.ledger.grant).toHaveBeenCalledTimes(1);
  });

  it("does not pay a win sent too fast", async () => {
    const t = setup({ existing: PLAY, now: at(3) });

    expect(await finishMinigame(t.deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(ok({ status: "lost", xpBonus: 0 }));
    expect(t.deps.ledger.grant).not.toHaveBeenCalled();
  });

  it("refuses a result without a ticket, and reports failures", async () => {
    expect(await finishMinigame(setup().deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(err({ code: "no-ticket" }));
    expect(await finishMinigame(setup({ finishFails: true }).deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(err({ code: "unknown" }));
    expect(await finishMinigame(setup({ existing: PLAY, now: at(30), grant: err({ code: "unknown" }) }).deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(err({ code: "unknown" }));
    expect(await finishMinigame(setup({ existing: PLAY, now: at(30), grant: err({ code: "not-registered" }) }).deps, "u1", { missionId: "ai-quiz", won: true })).toEqual(err({ code: "not-registered" }));
  });
});
