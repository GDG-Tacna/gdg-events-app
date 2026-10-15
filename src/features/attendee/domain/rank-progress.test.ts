import { describe, expect, it } from "vitest";
import { rankProgress } from "./rank";

describe("rankProgress", () => {
  it("starts empty at the first rank", () => {
    expect(rankProgress(0)).toMatchObject({
      rank: { id: "recruit" },
      next: { id: "pilot" },
      xpIntoRank: 0,
      xpSpan: 100,
      percent: 0,
    });
  });

  it.each([
    [50, 50],
    [99, 99],
    [100, 0], // reaching a threshold starts the next bar from zero
    [300, 50], // halfway between 100 and 500
    [750, 16], // the Design System example: 250 of the 1500 XP between Comandante and Leyenda Estelar
    [1999, 99],
  ] as const)("%i XP gives a bar at %i percent", (xp, percent) => {
    expect(rankProgress(xp).percent).toBe(percent);
  });

  it("reports the XP earned inside the rank and the span of the rank", () => {
    expect(rankProgress(750)).toMatchObject({
      rank: { id: "commander" },
      next: { id: "stellar-legend" },
      xpIntoRank: 250,
      xpSpan: 1500,
    });
  });

  it("is complete at the top rank, with nothing left to reach", () => {
    expect(rankProgress(2000)).toMatchObject({ rank: { id: "stellar-legend" }, next: null, xpSpan: null, percent: 100 });
    expect(rankProgress(50_000).percent).toBe(100);
  });

  it("never goes below 0 or above 100, even for strange XP values", () => {
    for (const xp of [-5, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      const { percent } = rankProgress(xp);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it("treats invalid XP as zero", () => {
    expect(rankProgress(Number.NaN)).toMatchObject({ rank: { id: "recruit" }, xpIntoRank: 0, percent: 0 });
    expect(rankProgress(-20)).toMatchObject({ rank: { id: "recruit" }, xpIntoRank: 0, percent: 0 });
  });
});
