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
    mocks.requirementsOf.mockResolvedValue({ ok: true, value: { minLevel: 3, minTalks: 2, minTicket: null } });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 2 });
  });

  it("ranks the person with the edition's ladder and counts their talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 200, ticket: { type: "general", source: "default" } } });

    // Level 3 on this edition's ladder (the bundled one would say level 2).
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: true } });
    expect(mocks.requirementsOf).toHaveBeenCalledWith("lunch-1");
    expect(mocks.findByUid).toHaveBeenCalledWith("u1");
    expect(mocks.getEditionLadder).toHaveBeenCalledWith({ marker: "ranks" });
    expect(mocks.talksAttended).toHaveBeenCalledWith("u1");
  });

  it("says the level to reach and the talks missing", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 199, ticket: { type: "general", source: "default" } } });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 0 });

    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: false, missing: { level: 3, talks: 2, ticket: null } } });
  });

  it("reads the ticket of the person for a meal that asks for one, and a person without a profile counts as general", async () => {
    mocks.requirementsOf.mockResolvedValue({ ok: true, value: { minLevel: null, minTalks: null, minTicket: "premium" } });
    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 0, ticket: { type: "pro", source: "list" } } });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: false, missing: { level: null, talks: null, ticket: "premium" } } });

    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 0, ticket: { type: "premium", source: "manual" } } });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: true, value: { allowed: true } });

    mocks.findByUid.mockResolvedValue({ ok: true, value: null });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toMatchObject({ ok: true, value: { allowed: false, missing: { ticket: "premium" } } });
  });

  it("counts someone without a profile as the first level with no talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: true, value: null });
    mocks.talksAttended.mockResolvedValue({ ok: true, value: 0 });

    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toMatchObject({ ok: true, value: { allowed: false, missing: { level: 3 } } });
  });

  it("reports a failed read of the person or their talks", async () => {
    mocks.findByUid.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await foodGate.check({ uid: "u1", checkpoint: LUNCH })).toEqual({ ok: false, error: { code: "unknown" } });

    mocks.findByUid.mockResolvedValue({ ok: true, value: { uid: "u1", xp: 500, ticket: { type: "general", source: "default" } } });
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
    expect(await describeShortfall({ level: 2, talks: 1, ticket: null })).toEqual({ level: 2, levelName: "Piloto", talks: 1, ticket: null });
    expect(await describeShortfall({ level: 3, talks: null, ticket: "premium" })).toEqual({ level: 3, levelName: "As del Cosmos", talks: null, ticket: "premium" });
  });

  it("leaves a level the ladder does not have without a name, and reads nothing when no level is missing", async () => {
    expect(await describeShortfall({ level: 7, talks: null, ticket: null })).toEqual({ level: 7, levelName: null, talks: null, ticket: null });
    mocks.getEditionLadder.mockClear();
    expect(await describeShortfall({ level: null, talks: 2, ticket: "pro" })).toEqual({ level: null, levelName: null, talks: 2, ticket: "pro" });
    expect(mocks.getEditionLadder).not.toHaveBeenCalled();
  });
});
