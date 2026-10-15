import { describe, expect, it } from "vitest";
import { checkBadge } from "../domain/badge";
import { DEFAULT_BADGES } from "./default-badges";

describe("DEFAULT_BADGES", () => {
  it("are valid badges, active and in order, with unique ids", () => {
    DEFAULT_BADGES.forEach((badge, index) => {
      const { id, ...data } = badge;
      expect(checkBadge(id, data)).toEqual({ ok: true, value: badge });
      expect(badge.order).toBe(index);
      expect(badge.active).toBe(true);
    });
    expect(new Set(DEFAULT_BADGES.map((badge) => badge.id)).size).toBe(DEFAULT_BADGES.length);
  });

  it("only use rules that work with any edition's missions and quadrants", () => {
    for (const badge of DEFAULT_BADGES) {
      expect(["quadrant-complete", "mission-completed"]).not.toContain(badge.rule.type);
    }
  });
});
