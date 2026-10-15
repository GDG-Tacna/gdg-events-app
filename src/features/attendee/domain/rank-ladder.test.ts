import { describe, expect, it } from "vitest";
import { EDITION } from "@/shared/config/edition";
import { RANKS, createRankLadder, nextRank, rankFor, rankProgress } from "./rank";

describe("createRankLadder", () => {
  it("numbers levels by position, whatever the ids and thresholds are", () => {
    const ladder = createRankLadder([
      { id: "novice", minXp: 0 },
      { id: "expert", minXp: 50 },
    ]);

    expect(ladder).toEqual([
      { id: "novice", minXp: 0, level: 1 },
      { id: "expert", minXp: 50, level: 2 },
    ]);
  });

  it("builds the default ladder from the edition configuration", () => {
    expect(RANKS.map(({ id, minXp }) => ({ id, minXp }))).toEqual(EDITION.ranks);
  });

  it.each([
    ["an empty ladder", []],
    ["a first rank above 0 XP", [{ id: "a", minXp: 10 }]],
    ["equal thresholds, which would make a rank unreachable", [{ id: "a", minXp: 0 }, { id: "b", minXp: 0 }]],
    ["thresholds going down", [{ id: "a", minXp: 0 }, { id: "b", minXp: 100 }, { id: "c", minXp: 50 }]],
    ["a fractional threshold", [{ id: "a", minXp: 0 }, { id: "b", minXp: 10.5 }]],
    ["a negative threshold", [{ id: "a", minXp: 0 }, { id: "b", minXp: -5 }]],
    ["a repeated id", [{ id: "a", minXp: 0 }, { id: "a", minXp: 10 }]],
  ])("refuses %s instead of showing wrong ranks", (_name, definitions) => {
    expect(() => createRankLadder(definitions)).toThrow();
  });
});

describe("a different ladder (another edition or levels edited later)", () => {
  const ladder = createRankLadder([
    { id: "seed", minXp: 0 },
    { id: "sprout", minXp: 30 },
    { id: "tree", minXp: 90 },
  ]);

  it("ranks the same XP differently without touching any stored data", () => {
    expect(rankFor(100).id).toBe("pilot");
    expect(rankFor(100, ladder).id).toBe("tree");
    expect(rankFor(29, ladder).id).toBe("seed");
  });

  it("finds the next rank and the top of the new ladder", () => {
    expect(nextRank(0, ladder)?.id).toBe("sprout");
    expect(nextRank(90, ladder)).toBeNull();
  });

  it("measures progress against the thresholds of that ladder", () => {
    expect(rankProgress(60, ladder)).toMatchObject({
      rank: { id: "sprout", level: 2 },
      next: { id: "tree" },
      xpIntoRank: 30,
      xpSpan: 60,
      percent: 50,
    });
    expect(rankProgress(500, ladder).percent).toBe(100);
  });

  it("keeps the level of a rank when its id is renamed, so level gates survive", () => {
    const renamed = createRankLadder([
      { id: "newcomer", minXp: 0 },
      { id: "regular", minXp: 100 },
    ]);

    expect(rankFor(100, renamed).level).toBe(rankFor(100, createRankLadder([{ id: "x", minXp: 0 }, { id: "y", minXp: 100 }])).level);
  });
});
