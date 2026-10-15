import { describe, expect, it } from "vitest";
import { isQuadrantId, QUADRANT_PLANETS } from "../domain/quadrant";
import { parseVenueMap } from "../domain/venue";
import { DEFAULT_QUADRANTS, DEFAULT_VENUE } from "./default-layout";

describe("default layout", () => {
  it("has the five planets of the Design System, each once, with valid ids", () => {
    expect(DEFAULT_QUADRANTS.map((quadrant) => quadrant.planet).sort()).toEqual([...QUADRANT_PLANETS].sort());
    expect(DEFAULT_QUADRANTS.every((quadrant) => isQuadrantId(quadrant.id) && quadrant.active)).toBe(true);
    expect(new Set(DEFAULT_QUADRANTS.map((quadrant) => quadrant.order)).size).toBe(DEFAULT_QUADRANTS.length);
  });

  it("is a plan that can be drawn (the same check the admin's plans go through)", () => {
    expect(parseVenueMap(DEFAULT_VENUE)).toEqual(DEFAULT_VENUE);
  });

  it("has an auditorium, an entrance, catering, and two stands for every quadrant", () => {
    const kinds = DEFAULT_VENUE.areas.map((area) => area.kind);
    expect(kinds).toEqual(expect.arrayContaining(["auditorium", "entrance", "catering"]));

    for (const quadrant of DEFAULT_QUADRANTS) {
      expect(DEFAULT_VENUE.areas.filter((area) => area.quadrantId === quadrant.id)).toHaveLength(2);
    }
    const ids = new Set(DEFAULT_QUADRANTS.map((quadrant) => quadrant.id));
    expect(DEFAULT_VENUE.areas.filter((area) => area.kind === "stand").every((area) => ids.has(area.quadrantId!))).toBe(true);
  });
});
