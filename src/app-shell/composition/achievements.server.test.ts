import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "e1" }));

const mocks = vi.hoisted(() => ({
  listFor: vi.fn(),
  missions: vi.fn(),
  checkInsOf: vi.fn(),
  findByUid: vi.fn(),
  getEditionLadder: vi.fn(),
  getGalaxyMap: vi.fn(),
  badges: vi.fn(),
  awardsOf: vi.fn(),
  award: vi.fn(),
  contactsOf: vi.fn(),
  features: { achievements: true },
}));
vi.mock("./missions.server", () => ({ missionDeps: { completions: { listFor: mocks.listFor } }, missionSource: { list: mocks.missions } }));
vi.mock("./attendee.server", () => ({ attendeeDeps: { attendees: { findByUid: mocks.findByUid } } }));
vi.mock("./ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
vi.mock("./quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
vi.mock("./network.server", () => ({ networkStore: { countFor: mocks.contactsOf } }));
vi.mock("@/features/network/server", async () => {
  const network = await import("@/features/network/domain/network");
  return { countContacts: network.countContacts };
});
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/attendee/server", () => ({ getEditionLadder: mocks.getEditionLadder }));
vi.mock("@/features/quadrants/server", () => ({ getGalaxyMap: mocks.getGalaxyMap }));
vi.mock("@/features/missions/server", () => ({ DEFAULT_MISSIONS: [{ id: "bundled", quadrantId: "ai", active: true }] }));
vi.mock("@/features/checkins/server", () => ({
  FirestoreCheckInCounter: class {
    checkInsOf = mocks.checkInsOf;
  },
}));
vi.mock("@/shared/config/features", () => ({ FEATURES: mocks.features }));
vi.mock("@/features/achievements/server", async () => {
  const domain = await import("@/features/achievements/domain/achievements");
  return {
    ...domain,
    DEFAULT_BADGES: [],
    CachedBadgeSource: class {
      list = mocks.badges;
    },
    FirestoreBadgeStore: class {},
    FirestoreAwardStore: class {
      awardsOf = mocks.awardsOf;
      award = mocks.award;
    },
  };
});

const { createRankLadder } = await import("@/features/attendee");
const { achievementAdminDeps, achievementDeps, unlockAchievements } = await import("./achievements.server");

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = { ok: false as const, error: { code: "unknown" } };

const MISSIONS = [
  { id: "ai-quiz", quadrantId: "ai", active: true },
  { id: "ai-kw", quadrantId: "ai", active: true },
  { id: "ai-old", quadrantId: "ai", active: false },
  { id: "cloud-talk", quadrantId: "cloud", active: true },
];

describe("achievementDeps.progress", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listFor.mockResolvedValue(ok([{ missionId: "ai-quiz", status: "completed" }, { missionId: "ai-kw", status: "failed" }, { missionId: "ai-old", status: "completed" }]));
    mocks.missions.mockResolvedValue(ok(MISSIONS));
    mocks.checkInsOf.mockImplementation(async (_uid: string, kind: string) => ok(kind === "talk" ? 4 : 2));
    mocks.findByUid.mockResolvedValue(ok({ uid: "u1", xp: 200, credits: 35 }));
    mocks.getEditionLadder.mockResolvedValue(createRankLadder([{ id: "a", minXp: 0 }, { id: "b", minXp: 50 }, { id: "c", minXp: 200 }]));
    mocks.contactsOf.mockResolvedValue(ok(3));
  });

  it("gathers the attendee's progress from missions, check-ins, XP on the edition's ladder and credits", async () => {
    expect(await achievementDeps.progress.progress("u1")).toEqual(
      ok({
        completedMissionIds: new Set(["ai-quiz", "ai-old"]),
        missionsByQuadrant: new Map([
          ["ai", ["ai-quiz", "ai-kw"]],
          ["cloud", ["cloud-talk"]],
        ]),
        talks: 4,
        stands: 2,
        level: 3,
        credits: 35,
        contacts: 3,
      }),
    );
    expect(mocks.listFor).toHaveBeenCalledWith("u1");
    expect(mocks.checkInsOf).toHaveBeenCalledWith("u1", "talk");
    expect(mocks.checkInsOf).toHaveBeenCalledWith("u1", "stand");
    expect(mocks.getEditionLadder).toHaveBeenCalledWith({ marker: "ranks" });
    expect(mocks.contactsOf).toHaveBeenCalledWith("u1");
  });

  it("uses the bundled missions while the edition has none, and counts someone without a profile from zero", async () => {
    mocks.missions.mockResolvedValue(ok([]));
    mocks.findByUid.mockResolvedValue(ok(null));

    expect(await achievementDeps.progress.progress("u1")).toMatchObject({ ok: true, value: { missionsByQuadrant: new Map([["ai", ["bundled"]]]), level: 1, credits: 0 } });
  });

  it.each([
    ["completions", () => mocks.listFor.mockResolvedValue(fail)],
    ["missions", () => mocks.missions.mockResolvedValue(fail)],
    ["check-ins", () => mocks.checkInsOf.mockResolvedValue(fail)],
    ["attendee", () => mocks.findByUid.mockResolvedValue(fail)],
    ["contacts", () => mocks.contactsOf.mockResolvedValue(fail)],
  ])("reports a failed read of the %s", async (_part, breakIt) => {
    breakIt();
    expect(await achievementDeps.progress.progress("u1")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("unlockAchievements", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.features.achievements = true;
    mocks.listFor.mockResolvedValue(ok([{ missionId: "ai-quiz", status: "completed" }]));
    mocks.missions.mockResolvedValue(ok(MISSIONS));
    mocks.checkInsOf.mockResolvedValue(ok(0));
    mocks.findByUid.mockResolvedValue(ok({ uid: "u1", xp: 0, credits: 0 }));
    mocks.getEditionLadder.mockResolvedValue(createRankLadder([{ id: "a", minXp: 0 }]));
    mocks.contactsOf.mockResolvedValue(ok(0));
    mocks.badges.mockResolvedValue(ok([{ id: "first", name: "Primer salto", description: "Haz algo.", tone: "lime", rule: { type: "missions-completed", count: 1 }, order: 0, active: true }]));
    mocks.awardsOf.mockResolvedValue(ok(new Map()));
    mocks.award.mockResolvedValue(ok({ awarded: true }));
  });

  it("answers the badges just unlocked, as plain data", async () => {
    expect(await unlockAchievements("u1")).toEqual([{ id: "first", name: "Primer salto", tone: "lime", imageUrl: null }]);
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ uid: "u1", badgeId: "first" }));
  });

  it("answers none with achievements off, or when the evaluation fails", async () => {
    mocks.features.achievements = false;
    expect(await unlockAchievements("u1")).toEqual([]);
    expect(mocks.badges).not.toHaveBeenCalled();

    mocks.features.achievements = true;
    mocks.awardsOf.mockResolvedValue(fail);
    expect(await unlockAchievements("u1")).toEqual([]);
  });
});

describe("achievementAdminDeps.directory", () => {
  beforeEach(() => vi.resetAllMocks());

  it("names the edition's quadrants and every mission it offers", async () => {
    mocks.getGalaxyMap.mockResolvedValue(ok({ quadrants: [{ id: "ai" }, { id: "cloud" }] }));
    mocks.missions.mockResolvedValue(ok(MISSIONS));

    expect(await achievementAdminDeps.directory.quadrantIds()).toEqual(ok(new Set(["ai", "cloud"])));
    expect(await achievementAdminDeps.directory.missionIds()).toEqual(ok(new Set(["ai-quiz", "ai-kw", "ai-old", "cloud-talk"])));
    expect(mocks.getGalaxyMap).toHaveBeenCalledWith({ marker: "galaxy" });
  });

  it("reports failed reads", async () => {
    mocks.getGalaxyMap.mockResolvedValue(fail);
    mocks.missions.mockResolvedValue(fail);

    expect(await achievementAdminDeps.directory.quadrantIds()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await achievementAdminDeps.directory.missionIds()).toEqual(fail);
  });
});
