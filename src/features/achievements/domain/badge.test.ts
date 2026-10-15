import { describe, expect, it } from "vitest";
import { checkBadge, meetsRule, parseBadge, parseRule, ruleProgress, type BadgeRule, type PlayerProgress } from "./badge";

const PLAYER: PlayerProgress = {
  completedMissionIds: new Set(["ai-quiz", "ai-keyword", "cloud-talk"]),
  missionsByQuadrant: new Map([
    ["ai", ["ai-quiz", "ai-keyword"]],
    ["cloud", ["cloud-talk", "cloud-stand"]],
    ["empty", []],
  ]),
  talks: 2,
  stands: 1,
  level: 3,
  credits: 45,
  contacts: 4,
};

describe("parseRule", () => {
  it.each([
    [{ type: "missions-completed", count: 5 }, { type: "missions-completed", count: 5 }],
    [{ type: "talks-attended", count: 1000 }, { type: "talks-attended", count: 1000 }],
    [{ type: "stands-visited", count: 1 }, { type: "stands-visited", count: 1 }],
    [{ type: "credits-earned", count: 100_000 }, { type: "credits-earned", count: 100_000 }],
    [{ type: "contacts-made", count: 5 }, { type: "contacts-made", count: 5 }],
    [{ type: "level-reached", level: 2 }, { type: "level-reached", level: 2 }],
    [{ type: "level-reached", level: 10 }, { type: "level-reached", level: 10 }],
    [{ type: "quadrant-complete", quadrantId: "ai" }, { type: "quadrant-complete", quadrantId: "ai" }],
    [{ type: "mission-completed", missionId: "ai-quiz", extra: true }, { type: "mission-completed", missionId: "ai-quiz" }],
  ])("reads %j", (input, rule) => {
    expect(parseRule(input)).toEqual(rule);
  });

  it.each([
    [null],
    ["missions-completed"],
    [{ type: "dance-off", count: 1 }],
    [{ type: "missions-completed", count: 0 }],
    [{ type: "missions-completed", count: 1001 }],
    [{ type: "talks-attended", count: 2.5 }],
    [{ type: "stands-visited", count: "3" }],
    [{ type: "credits-earned", count: 100_001 }],
    [{ type: "contacts-made", count: 0 }],
    [{ type: "contacts-made", count: 1001 }],
    [{ type: "level-reached", level: 1 }],
    [{ type: "level-reached", level: 11 }],
    [{ type: "quadrant-complete", quadrantId: "../x" }],
    [{ type: "mission-completed" }],
  ])("refuses %j", (input) => {
    expect(parseRule(input)).toBeNull();
  });
});

describe("ruleProgress", () => {
  it.each<[BadgeRule, { current: number; target: number }, boolean]>([
    [{ type: "missions-completed", count: 3 }, { current: 3, target: 3 }, true],
    [{ type: "missions-completed", count: 4 }, { current: 3, target: 4 }, false],
    [{ type: "talks-attended", count: 3 }, { current: 2, target: 3 }, false],
    [{ type: "stands-visited", count: 1 }, { current: 1, target: 1 }, true],
    [{ type: "level-reached", level: 3 }, { current: 3, target: 3 }, true],
    [{ type: "level-reached", level: 4 }, { current: 3, target: 4 }, false],
    [{ type: "credits-earned", count: 50 }, { current: 45, target: 50 }, false],
    [{ type: "credits-earned", count: 45 }, { current: 45, target: 45 }, true],
    [{ type: "contacts-made", count: 5 }, { current: 4, target: 5 }, false],
    [{ type: "contacts-made", count: 4 }, { current: 4, target: 4 }, true],
    [{ type: "quadrant-complete", quadrantId: "ai" }, { current: 2, target: 2 }, true],
    [{ type: "quadrant-complete", quadrantId: "cloud" }, { current: 1, target: 2 }, false],
    [{ type: "mission-completed", missionId: "cloud-talk" }, { current: 1, target: 1 }, true],
    [{ type: "mission-completed", missionId: "cloud-stand" }, { current: 0, target: 1 }, false],
  ])("measures %j", (rule, progress, met) => {
    expect(ruleProgress(rule, PLAYER)).toEqual(progress);
    expect(meetsRule(rule, PLAYER)).toBe(met);
  });

  it("never completes a quadrant without missions, or one the edition does not have", () => {
    expect(ruleProgress({ type: "quadrant-complete", quadrantId: "empty" }, PLAYER)).toEqual({ current: 0, target: 1 });
    expect(meetsRule({ type: "quadrant-complete", quadrantId: "empty" }, PLAYER)).toBe(false);
    expect(meetsRule({ type: "quadrant-complete", quadrantId: "unknown" }, PLAYER)).toBe(false);
  });
});

describe("checkBadge", () => {
  const VALID = { name: "  Primer   salto ", description: "Completa tu primera misión.", tone: "cyan", rule: { type: "missions-completed", count: 1 }, order: 2, active: true };

  it("reads a badge, tidying its text", () => {
    expect(checkBadge("primer-salto", VALID)).toEqual({
      ok: true,
      value: { id: "primer-salto", name: "Primer salto", description: "Completa tu primera misión.", tone: "cyan", rule: { type: "missions-completed", count: 1 }, order: 2, active: true, image: null },
    });
  });

  it("reads a missing order as last and a missing state as inactive", () => {
    expect(parseBadge("primer-salto", { ...VALID, order: undefined, active: undefined })).toMatchObject({ order: Number.MAX_SAFE_INTEGER, active: false });
  });

  it.each([
    ["Bad Id", VALID, "invalid-id"],
    ["badge", null, "invalid-name"],
    ["badge", { ...VALID, name: "x" }, "invalid-name"],
    ["badge", { ...VALID, name: "x".repeat(41) }, "invalid-name"],
    ["badge", { ...VALID, description: "ab" }, "invalid-description"],
    ["badge", { ...VALID, description: "x".repeat(161) }, "invalid-description"],
    ["badge", { ...VALID, tone: "red" }, "invalid-tone"],
    ["badge", { ...VALID, tone: undefined }, "invalid-tone"],
    ["badge", { ...VALID, rule: { type: "missions-completed", count: 0 } }, "invalid-rule"],
  ])("says what is wrong with %s %j", (id, input, code) => {
    expect(checkBadge(id, input)).toEqual({ ok: false, code });
    expect(parseBadge(id, input)).toBeNull();
  });

  it("accepts names and descriptions at their limits", () => {
    expect(checkBadge("badge", { ...VALID, name: "ab", description: "abc" }).ok).toBe(true);
    expect(checkBadge("badge", { ...VALID, name: "x".repeat(40), description: "x".repeat(160) }).ok).toBe(true);
  });
});
