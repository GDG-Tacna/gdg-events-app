import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { createRankLadder, parseRankLadder, rankLadderProblems, type RankLadder } from "./rank";
import { getEditionLadder, getRanksForEdit, saveRanks, type RankAdminDeps, type RankAuditEntry } from "./rank-admin";

const DEFAULTS = createRankLadder([
  { id: "recruit", name: "Recluta", minXp: 0 },
  { id: "pilot", name: "Piloto", minXp: 100 },
]);
const OWN = [
  { id: "cadet", name: "Cadete", minXp: 0 },
  { id: "ace", name: "As", minXp: 50 },
];
const ADMIN = { uid: "a1", role: "admin" } as const;

function setup(stored: RankLadder | null = null) {
  const entries: RankAuditEntry[] = [];
  const deps = {
    store: {
      load: vi.fn(async (): Promise<Result<RankLadder | null, { code: string }>> => ok(stored)),
      save: vi.fn(async (): Promise<Result<void, { code: string }>> => ok(undefined)),
    },
    defaults: DEFAULTS,
    images: { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) },
    audit: { append: vi.fn(async (entry: RankAuditEntry) => (entries.push(entry), ok(undefined))) },
    now: () => new Date(0),
  } satisfies RankAdminDeps;
  return { deps, entries };
}

describe("rank ladder rules", () => {
  it("accepts a ladder from 0, rising, with names and slug ids", () => {
    expect(parseRankLadder([...OWN, { id: "legend", name: "  Leyenda   viva ", minXp: 2000 }])).toEqual([
      { id: "cadet", name: "Cadete", minXp: 0, level: 1 },
      { id: "ace", name: "As", minXp: 50, level: 2 },
      { id: "legend", name: "Leyenda viva", minXp: 2000, level: 3 },
    ]);
  });

  it("points at each wrong rank, by position", () => {
    const problems = rankLadderProblems([
      { id: "a", name: "Uno", minXp: 5 },
      { id: "a", name: "X", minXp: 5 },
      { id: "Bad Id", name: "Tres", minXp: 2.5 },
      { id: "d", name: "x".repeat(31), minXp: 200_000 },
    ]);

    expect(Object.fromEntries(problems)).toEqual({ 0: ["first-not-zero"], 1: ["name", "id", "not-rising"], 2: ["id", "xp"], 3: ["name", "xp"] });
  });

  it.each([
    ["not a list", { ranks: [] }],
    ["no ranks", []],
    ["more than ten ranks", Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, name: `Rango ${i}`, minXp: i * 10 }))],
    ["a rank without a name", [{ id: "a", minXp: 0 }]],
    ["XP as text", [{ id: "a", name: "Uno", minXp: "0" }]],
    ["not rising", [...OWN, { id: "c", name: "Otro", minXp: 50 }]],
  ])("refuses %s", (_, input) => {
    expect(parseRankLadder(input)).toBeNull();
  });
});

describe("rank admin", () => {
  it("prices everyone with the edition's ladder, or the bundled one, and never fails", async () => {
    const own = createRankLadder(OWN);
    expect(await getEditionLadder(setup(own).deps)).toBe(own);
    expect(await getEditionLadder(setup(null).deps)).toBe(DEFAULTS);

    const broken = setup();
    broken.deps.store.load.mockResolvedValueOnce(err({ code: "offline" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await getEditionLadder(broken.deps)).toBe(DEFAULTS);
    expect(console.error).toHaveBeenCalled();
  });

  it("offers the ladder to edit, saying whether it is the bundled one", async () => {
    expect(await getRanksForEdit(setup().deps, ADMIN)).toEqual(ok({ ranks: [{ id: "recruit", name: "Recluta", minXp: 0, icon: null }, { id: "pilot", name: "Piloto", minXp: 100, icon: null }], isDefault: true }));
    expect(await getRanksForEdit(setup(createRankLadder(OWN)).deps, ADMIN)).toEqual(ok({ ranks: OWN.map((rank) => ({ ...rank, icon: null })), isDefault: false }));
  });

  describe("icons", () => {
    const ICON = "public/devfest-2026/rank/0f8e2c1a-1111-4222-8333-944455551111.webp";
    const OLD = "public/devfest-2026/rank/0f8e2c1a-1111-4222-8333-944455550000.webp";
    const ref = (path: string) => ({ path, url: `https://cdn/${path}` });

    it("saves each rank's icon as its path and answers it on the ladder", async () => {
      const { deps } = setup();

      const saved = await saveRanks(deps, ADMIN, [OWN[0], { ...OWN[1], iconPath: ICON }]);

      expect(saved.ok && saved.value[1].icon).toEqual(ref(ICON));
      expect(saved.ok && saved.value[0]).not.toHaveProperty("icon");
      expect(deps.store.save).toHaveBeenCalledWith([{ ...OWN[0], iconPath: null }, { ...OWN[1], iconPath: ICON }]);
    });

    it("deletes the icons no rank keeps, and leaves the kept ones", async () => {
      const stored = createRankLadder([{ ...OWN[0], icon: ref(OLD) }, { ...OWN[1], icon: ref(ICON) }]);
      const { deps } = setup(stored);

      await saveRanks(deps, ADMIN, [OWN[0], { ...OWN[1], iconPath: ICON }]);

      expect(deps.images.remove).toHaveBeenCalledTimes(1);
      expect(deps.images.remove).toHaveBeenCalledWith(OLD);
    });

    it("refuses another kind's image, saving nothing", async () => {
      const { deps } = setup();

      expect(await saveRanks(deps, ADMIN, [OWN[0], { ...OWN[1], iconPath: "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" }])).toEqual(err({ code: "invalid-image" }));
      expect(deps.store.save).not.toHaveBeenCalled();
    });
  });

  it("saves a valid ladder and audits it", async () => {
    const { deps, entries } = setup();

    expect(await saveRanks(deps, ADMIN, OWN)).toMatchObject({ ok: true });
    expect(deps.store.save).toHaveBeenCalledWith(OWN.map((rank) => ({ ...rank, iconPath: null })));
    expect(entries).toEqual([{ action: "ranks.updated", actorUid: "a1", targetUid: "ranks", details: { ladder: "Cadete:0,As:50" }, at: new Date(0) }]);
  });

  it("refuses an invalid ladder, anyone but an admin, and reports failures", async () => {
    const { deps } = setup();

    expect(await saveRanks(deps, ADMIN, [{ id: "a", name: "Uno", minXp: 10 }])).toEqual(err({ code: "invalid-ranks" }));
    expect(await saveRanks(deps, { uid: "s1", role: "staff" }, OWN)).toEqual(err({ code: "forbidden" }));
    expect(await getRanksForEdit(deps, { uid: "s1", role: "staff" })).toEqual(err({ code: "forbidden" }));
    expect(deps.store.save).not.toHaveBeenCalled();

    deps.store.save.mockResolvedValueOnce(err({ code: "x" }));
    expect(await saveRanks(deps, ADMIN, OWN)).toEqual(err({ code: "unknown" }));
    deps.store.load.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getRanksForEdit(deps, ADMIN)).toEqual(err({ code: "unknown" }));
  });
});
