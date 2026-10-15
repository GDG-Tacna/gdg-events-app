import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { getGalaxyMap } from "./galaxy";
import type { EditionLayout } from "./ports";
import type { Quadrant } from "./quadrant";
import type { VenueArea, VenueMap } from "./venue";

const quadrant = (id: string, order: number, active = true): Quadrant => ({ id, name: id.toUpperCase(), tagline: "Lema", planet: "cloud", order, active });
const stand = (id: string, quadrantId: string, x: number): VenueArea => ({ id, kind: "stand", label: id, quadrantId, rect: { x, y: 0, width: 10, height: 10 } });
const venue = (areas: VenueArea[]): VenueMap => ({ width: 100, height: 100, areas });

const DEFAULTS = {
  quadrants: [quadrant("default", 0)],
  venue: venue([stand("default-1", "default", 0)]),
};

const run = (layout: EditionLayout) => getGalaxyMap({ source: { load: vi.fn(async () => ok(layout)) }, defaults: DEFAULTS });

describe("getGalaxyMap", () => {
  it("serves the bundled quadrants and plan while the edition has none", async () => {
    const result = await run({ quadrants: [], venue: null });

    expect(result).toEqual(ok({ venue: DEFAULTS.venue, quadrants: [{ ...DEFAULTS.quadrants[0], stands: DEFAULTS.venue.areas }] }));
  });

  it("uses the edition's own quadrants and plan once saved", async () => {
    const own = venue([stand("b-1", "b", 20), stand("a-1", "a", 0)]);

    const result = await run({ quadrants: [quadrant("b", 1), quadrant("a", 0)], venue: own });

    expect(result.ok && result.value.venue).toEqual(own);
    expect(result.ok && result.value.quadrants.map((q) => [q.id, q.stands.map((s) => s.id)])).toEqual([
      ["a", ["a-1"]],
      ["b", ["b-1"]],
    ]);
  });

  it("keeps the bundled plan when only quadrants were saved, and the other way round", async () => {
    const onlyQuadrants = await run({ quadrants: [quadrant("default", 0)], venue: null });
    const onlyVenue = await run({ quadrants: [], venue: venue([stand("x", "default", 50)]) });

    expect(onlyQuadrants.ok && onlyQuadrants.value.venue).toEqual(DEFAULTS.venue);
    expect(onlyVenue.ok && onlyVenue.value.quadrants.map((q) => q.id)).toEqual(["default"]);
  });

  it("orders quadrants by their order, then by name", async () => {
    const result = await run({ quadrants: [quadrant("zeta", 1), quadrant("beta", 1), quadrant("alpha", 2), quadrant("omega", 0)], venue: venue([]) });

    expect(result.ok && result.value.quadrants.map((q) => q.id)).toEqual(["omega", "beta", "zeta", "alpha"]);
  });

  it("hides inactive quadrants, and their stands stay on the plan as plain stands", async () => {
    const result = await run({
      quadrants: [quadrant("a", 0), quadrant("b", 1, false)],
      venue: venue([stand("a-1", "a", 0), stand("b-1", "b", 20), stand("ghost-1", "ghost", 40)]),
    });

    expect(result.ok && result.value.quadrants.map((q) => q.id)).toEqual(["a"]);
    expect(result.ok && result.value.venue.areas.map((area) => [area.id, area.quadrantId])).toEqual([
      ["a-1", "a"],
      ["b-1", null],
      ["ghost-1", null],
    ]);
  });

  it("reports a failed read instead of guessing", async () => {
    const result = await getGalaxyMap({ source: { load: async () => err({ code: "boom" }) }, defaults: DEFAULTS });

    expect(result).toEqual(err({ code: "unknown" }));
  });
});
