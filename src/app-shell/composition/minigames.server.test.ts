import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "e1" }));
const mocks = vi.hoisted(() => ({ list: vi.fn(), listFor: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("./missions.server", () => ({ missionSource: { list: mocks.list }, missionDeps: { completions: { listFor: mocks.listFor } } }));
vi.mock("./economy.server", () => ({ rewardLedger: { marker: "ledger" } }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/missions/server", () => ({ DEFAULT_MISSIONS: [{ id: "bundled", minigame: "warp-timing", active: true }] }));
vi.mock("@/features/minigames/server", async () => {
  const settings = await import("@/features/minigames/domain/settings");
  return {
    getMinigameSettings: settings.getMinigameSettings,
    FirestoreMinigameStore: class {
      read = mocks.read;
      save = mocks.save;
    },
  };
});

const { enabledMinigames, minigameAdminDeps, minigameDeps, minigameViewDeps } = await import("./minigames.server");

const ok = <T,>(value: T) => ({ ok: true as const, value });
const MISSION = { id: "ai-quiz", minigame: "circuits", minigameDifficulty: "hard", active: true };

describe("minigameDeps.missions.bonusInfo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue(ok([MISSION, { id: "other", minigame: null, minigameDifficulty: null, active: false }]));
    mocks.listFor.mockResolvedValue(ok([{ missionId: "ai-quiz", status: "completed", xpEarned: 40 }, { missionId: "other", status: "failed", xpEarned: 0 }]));
  });

  it("answers the mission's game and what the attendee earned with it", async () => {
    expect(await minigameDeps.missions.bonusInfo("u1", "ai-quiz")).toEqual(ok({ minigame: "circuits", difficulty: "hard", active: true, completed: true, xpEarned: 40 }));
    expect(mocks.listFor).toHaveBeenCalledWith("u1");
  });

  it("answers not completed for a failed or untried mission, and null for an unknown one", async () => {
    expect(await minigameDeps.missions.bonusInfo("u1", "other")).toEqual(ok({ minigame: null, difficulty: null, active: false, completed: false, xpEarned: 0 }));
    mocks.listFor.mockResolvedValue(ok([]));
    expect(await minigameDeps.missions.bonusInfo("u1", "ai-quiz")).toMatchObject({ value: { completed: false, xpEarned: 0 } });
    expect(await minigameDeps.missions.bonusInfo("u1", "nope")).toEqual(ok(null));
  });

  it("uses the bundled missions while the edition has none", async () => {
    mocks.list.mockResolvedValue(ok([]));

    expect(await minigameDeps.missions.bonusInfo("u1", "bundled")).toMatchObject({ value: { minigame: "warp-timing" } });
  });

  it("reports a failed read", async () => {
    mocks.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await minigameDeps.missions.bonusInfo("u1", "ai-quiz")).toEqual({ ok: false, error: { code: "unknown" } });

    mocks.list.mockResolvedValue(ok([MISSION]));
    mocks.listFor.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await minigameDeps.missions.bonusInfo("u1", "ai-quiz")).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("offers missions the same difficulties as the mini-games catalog", async () => {
    const { MINIGAME_DIFFICULTIES } = await import("@/features/missions/domain/mission");
    const { DIFFICULTIES } = await import("@/features/minigames/domain/catalog");
    expect(MINIGAME_DIFFICULTIES).toEqual(DIFFICULTIES);
  });

  it("pays through the reward ledger", () => {
    expect(minigameDeps.ledger).toEqual({ marker: "ledger" });
  });
});

describe("mini-game settings: kept for screens, fresh for playing", () => {
  const settingsWith = (codeLanguages: string[]) => ({ games: {}, codeLanguages });

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.save.mockResolvedValue(ok(undefined));
    // Start every test from an empty cache: a save on this instance drops it.
    await minigameAdminDeps.store.save(settingsWith([]) as never);
    mocks.save.mockClear();
  });

  it("screens share one read; playing reads every time", async () => {
    mocks.read.mockResolvedValue(ok(settingsWith(["ts"])));

    await minigameViewDeps.settings();
    await minigameViewDeps.settings();
    expect(mocks.read).toHaveBeenCalledTimes(1);

    await minigameDeps.settings();
    await minigameDeps.settings();
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });

  it("an admin save drops what the screens kept", async () => {
    mocks.read.mockResolvedValueOnce(ok(settingsWith(["ts"]))).mockResolvedValueOnce(ok(settingsWith(["py"])));
    expect(await minigameViewDeps.settings()).toMatchObject({ codeLanguages: ["ts"] });

    await minigameAdminDeps.store.save(settingsWith(["py"]) as never);

    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(await minigameViewDeps.settings()).toMatchObject({ codeLanguages: ["py"] });
  });

  it("the admin screen reads the stored settings, never the kept ones", async () => {
    mocks.read.mockResolvedValue(ok(settingsWith(["ts"])));
    await minigameViewDeps.settings();

    await minigameAdminDeps.store.read();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});

describe("enabledMinigames", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.save.mockResolvedValue(ok(undefined));
    await minigameAdminDeps.store.save({ games: {}, codeLanguages: [] } as never);
  });

  it("lists the games the edition has on", async () => {
    mocks.read.mockResolvedValue(ok({ games: { circuits: { enabled: true, difficulty: "normal" }, "warp-timing": { enabled: false, difficulty: "easy" } }, codeLanguages: ["ts"] }));

    expect(await enabledMinigames()).toEqual(new Set(["circuits"]));
  });
});
