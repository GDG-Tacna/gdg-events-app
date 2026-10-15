import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findByUid: vi.fn(),
  getEditionLadder: vi.fn(),
  talksAttended: vi.fn(),
  requirementsOf: vi.fn(),
}));
vi.mock("./attendee.server", () => ({ attendeeDeps: { attendees: { findByUid: mocks.findByUid } } }));
vi.mock("./ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
vi.mock("@/features/attendee/server", () => ({ getEditionLadder: mocks.getEditionLadder }));
vi.mock("@/features/checkins/server", () => ({
  FirestoreCheckInCounter: class {
    talksAttended = mocks.talksAttended;
  },
}));
vi.mock("@/features/checkpoints/server", async () => {
  const { FoodGate } = await import("@/features/checkpoints/domain/food-gate");
  return {
    FoodGate,
    FirestoreCheckpointStore: class {
      requirementsOf = mocks.requirementsOf;
    },
  };
});

const { createRankLadder } = await import("@/features/attendee");
const { describeShortfall, foodGate } = await import("./food-gate.server");

const LADDER = createRankLadder([
  { id: "recruit", minXp: 0 },
  { id: "pilot", minXp: 50 },
  { id: "commander", minXp: 200 },
]);
const LUNCH = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };

describe("foodGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getEditionLadder.mockResolvedValue(LADDER);
    mocks.requirementsOf.mockResolvedValue({ ok: true, value: { minLevel: 3, minTalks: 2 } });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 2 });
  });

  it("ranks the person with the edition's ladder and counts their talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 200 } });

    // Level 3 on this edition's ladder (the bundled one would say level 2).
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: true } });
    expect(mocks.requirementsOf).toHaveBeenCalledWith("lunch-1");
    expect(mocks.findByUid).toHaveBeenCalledWith("u1");
    expect(mocks.getEditionLadder).toHaveBeenCalledWith({ marker: "ranks" });
    expect(mocks.talksAttended).toHaveBeenCalledWith("u1");
  });

  it("says the level to reach and the talks missing", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 199 } });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 0 });

    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: false, missing: { level: 3, talks: 2 } } });
  });

  it("counts someone without a profile as the first level with no talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: null });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 0 });

    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toMatchObject({ ok: true, value: { allowed: false, missing: { level: 3 } } });
  });

  it("reports a failed read of the person or their talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: false, error: { code: "unknown" } });

    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 500 } });
    mocks.talksAttended.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("describeShortfall", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getEditionLadder.mockResolvedValue(createRankLadder([{ id: "recruit", minXp: 0 }, { id: "pilot", minXp: 50 }, { id: "ace", minXp: 90, name: "As del Cosmos" }]));
  });

  it("names the missing level as the edition's ladder does", async () => {
    expect(await describeShortfall({ level: 2, talks: 1 })).toEqual({ level: 2, levelName: "Piloto", talks: 1 });
    expect(await describeShortfall({ level: 3, talks: null })).toEqual({ level: 3, levelName: "As del Cosmos", talks: null });
  });

  it("leaves a level the ladder does not have without a name, and reads nothing when no level is missing", async () => {
    expect(await describeShortfall({ level: 7, talks: null })).toEqual({ level: 7, levelName: null, talks: null });
    mocks.getEditionLadder.mockClear();
    expect(await describeShortfall({ level: null, talks: 2 })).toEqual({ level: null, levelName: null, talks: 2 });
    expect(mocks.getEditionLadder).not.toHaveBeenCalled();
  });
});
