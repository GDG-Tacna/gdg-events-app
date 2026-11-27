import { describe, expect, it } from "vitest";
import {
  checkGlobalBadge,
  globalRuleProgress,
  meetsGlobalRule,
  parseGlobalRule,
  type GlobalPlayerProgress,
} from "./global-badge";

const PROGRESS: GlobalPlayerProgress = {
  eventsAttended: 2,
  totalCredits: 120,
  totalBadges: 6,
  certificatesEarned: 1,
  totalContacts: 9,
};

describe("global-badge domain", () => {
  it("parses valid global rules and rejects unknown or out-of-range rules", () => {
    expect(parseGlobalRule({ type: "events-attended", count: 2 })).toEqual({ type: "events-attended", count: 2 });
    expect(parseGlobalRule({ type: "certificates-earned", count: 1 })).toEqual({ type: "certificates-earned", count: 1 });
    expect(parseGlobalRule({ type: "total-credits", count: 500 })).toEqual({ type: "total-credits", count: 500 });
    expect(parseGlobalRule({ type: "events-attended", count: 0 })).toBeNull();
    expect(parseGlobalRule({ type: "events-attended", count: 101 })).toBeNull();
    expect(parseGlobalRule({ type: "missions-completed", count: 1 })).toBeNull();
  });

  it("evaluates progress across all five community rule types", () => {
    expect(globalRuleProgress({ type: "events-attended", count: 2 }, PROGRESS)).toEqual({ current: 2, target: 2 });
    expect(meetsGlobalRule({ type: "events-attended", count: 2 }, PROGRESS)).toBe(true);
    expect(meetsGlobalRule({ type: "events-attended", count: 3 }, PROGRESS)).toBe(false);
    expect(meetsGlobalRule({ type: "total-credits", count: 100 }, PROGRESS)).toBe(true);
    expect(meetsGlobalRule({ type: "total-badges", count: 5 }, PROGRESS)).toBe(true);
    expect(meetsGlobalRule({ type: "certificates-earned", count: 1 }, PROGRESS)).toBe(true);
    expect(meetsGlobalRule({ type: "total-contacts", count: 10 }, PROGRESS)).toBe(false);
  });

  it("validates badge fields cleanly", () => {
    const valid = checkGlobalBadge("primer-evento", {
      name: "Primer evento",
      description: "Participa en tu primer evento.",
      tone: "cyan",
      rule: { type: "events-attended", count: 1 },
      active: true,
    });
    expect(valid.ok).toBe(true);
    expect(checkGlobalBadge("Bad Id", { name: "Ok", description: "Ok desc", tone: "cyan", rule: { type: "events-attended", count: 1 } })).toEqual({
      ok: false,
      code: "invalid-id",
    });
    expect(checkGlobalBadge("ok-id", { name: "A", description: "Ok desc", tone: "cyan", rule: { type: "events-attended", count: 1 } })).toEqual({
      ok: false,
      code: "invalid-name",
    });
  });
});
