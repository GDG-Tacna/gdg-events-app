import { describe, expect, it } from "vitest";
import { rewardTimeline } from "./reward-chain";

describe("rewardTimeline", () => {
  it("is quick for a plain scan: only the message, and the badges right after it", () => {
    const timeline = rewardTimeline({ missions: 0, hasProgress: false, rankUp: false });

    expect(timeline.missions).toBe(0.5);
    expect(timeline.xp).toBe(0.5);
    expect(timeline.badges).toBeCloseTo(0.6);
  });

  it("stamps the missions one after another, then counts the XP and fills the bar, then the rank, then the badges", () => {
    const timeline = rewardTimeline({ missions: 2, hasProgress: true, rankUp: true });

    expect(timeline.missions).toBeCloseTo(0.5);
    // Two missions at 0.3 s each and a short pause.
    expect(timeline.xp).toBeCloseTo(1.3);
    expect(timeline.bar).toBeGreaterThan(timeline.xp);
    expect(timeline.rankUp).toBeGreaterThan(timeline.bar);
    expect(timeline.badges).toBeGreaterThan(timeline.rankUp);
  });

  it("takes no time for steps that do not exist", () => {
    const withBar = rewardTimeline({ missions: 1, hasProgress: true, rankUp: false });
    const withRank = rewardTimeline({ missions: 1, hasProgress: true, rankUp: true });
    const withoutBar = rewardTimeline({ missions: 1, hasProgress: false, rankUp: true });

    expect(withRank.badges).toBeGreaterThan(withBar.badges);
    // A rank-up without a bar to announce it is skipped.
    expect(withoutBar.badges).toBeLessThan(withBar.badges);
  });

  it("keeps a big scan within about three seconds", () => {
    expect(rewardTimeline({ missions: 2, hasProgress: true, rankUp: true }).badges).toBeLessThan(3.5);
  });
});
