import { describe, expect, it } from "vitest";
import { RANKS, nextRank, rankFor } from "./rank";

describe("rankFor", () => {
  it.each([
    [0, "recruit"],
    [99, "recruit"],
    [100, "pilot"],
    [499, "pilot"],
    [500, "commander"],
    [1999, "commander"],
    [2000, "stellar-legend"],
    [999_999, "stellar-legend"],
  ] as const)("%i XP is %s", (xp, id) => {
    expect(rankFor(xp).id).toBe(id);
  });

  it.each([-50, Number.NaN, Number.NEGATIVE_INFINITY])("treats %s XP as the first rank", (xp) => {
    expect(rankFor(xp).id).toBe("recruit");
  });

  it("treats infinite XP as the first rank too, since it is not a real score", () => {
    expect(rankFor(Number.POSITIVE_INFINITY).id).toBe("recruit");
  });

  it("numbers ranks 1 to 4 in ascending XP order", () => {
    expect(RANKS.map((rank) => rank.level)).toEqual([1, 2, 3, 4]);
    expect(RANKS.map((rank) => rank.minXp)).toEqual([0, 100, 500, 2000]);
  });
});

describe("nextRank", () => {
  it("points at the following rank", () => {
    expect(nextRank(0)?.id).toBe("pilot");
    expect(nextRank(100)?.id).toBe("commander");
    expect(nextRank(500)?.id).toBe("stellar-legend");
  });

  it("is null at the top rank", () => {
    expect(nextRank(2000)).toBeNull();
  });
});
