import { describe, expect, it } from "vitest";
import { parseVenueMap, VENUE_MAX_AREAS, venueProblems, type VenueArea } from "./venue";

const area = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "service",
  label: `Área ${id}`,
  rect: { x, y, width: 10, height: 10 },
  ...extra,
});
const plan = (areas: unknown[], size: Record<string, unknown> = {}) => ({ width: 100, height: 100, areas, ...size });

describe("parseVenueMap", () => {
  it("reads a plan that can be drawn, trimming labels and dropping quadrants from areas that are not stands", () => {
    const parsed = parseVenueMap(
      plan([
        area("hall", 0, 0, { label: "  Auditorio  ", kind: "auditorium", quadrantId: "cloud" }),
        area("cloud-1", 90, 90, { kind: "stand", quadrantId: "cloud" }),
      ]),
    );

    expect(parsed).toEqual({
      width: 100,
      height: 100,
      areas: [
        { id: "hall", kind: "auditorium", label: "Auditorio", quadrantId: null, rect: { x: 0, y: 0, width: 10, height: 10 } },
        { id: "cloud-1", kind: "stand", label: "Área cloud-1", quadrantId: "cloud", rect: { x: 90, y: 90, width: 10, height: 10 } },
      ],
    });
  });

  it.each([
    ["not an object", null],
    ["a plan too small", plan([area("a", 0, 0, { rect: { x: 0, y: 0, width: 1, height: 1 } })], { width: 9 })],
    ["a plan too large", plan([area("a", 0, 0)], { height: 401 })],
    ["a size that is not a whole number", plan([area("a", 0, 0)], { width: 50.5 })],
    ["no areas", plan([])],
    ["too many areas", plan(Array.from({ length: VENUE_MAX_AREAS + 1 }, (_, i) => area(`a${i}`, i % 10 * 10, Math.floor(i / 10) * 10)), { height: 400 })],
    ["an area past the right edge", plan([area("a", 91, 0)])],
    ["an area past the bottom edge", plan([area("a", 0, 91)])],
    ["an area starting outside", plan([area("a", -1, 0)])],
    ["an empty area", plan([area("a", 0, 0, { rect: { x: 0, y: 0, width: 0, height: 5 } })])],
    ["a fractional position", plan([area("a", 0.5, 0)])],
    ["two areas with the same id", plan([area("a", 0, 0), area("a", 50, 50)])],
    ["two areas on top of each other", plan([area("a", 0, 0), area("b", 5, 5)])],
    ["an unknown kind", plan([area("a", 0, 0, { kind: "pool" })])],
    ["a bad id", plan([area("Hall A", 0, 0)])],
    ["an empty label", plan([area("a", 0, 0, { label: "   " })])],
    ["a one-character label (a stand's checkpoint needs 2)", plan([area("a", 0, 0, { label: " A " })])],
    ["a label too long", plan([area("a", 0, 0, { label: "x".repeat(41) })])],
    ["a stand without a quadrant", plan([area("a", 0, 0, { kind: "stand" })])],
    ["a stand with an empty quadrant", plan([area("a", 0, 0, { kind: "stand", quadrantId: "" })])],
    ["an area without a rectangle", plan([{ id: "a", kind: "service", label: "A" }])],
  ])("refuses %s", (_, input) => {
    expect(parseVenueMap(input)).toBeNull();
  });

  it("accepts areas that only touch each other", () => {
    expect(parseVenueMap(plan([area("a", 0, 0), area("b", 10, 0), area("c", 0, 10)]))?.areas).toHaveLength(3);
  });
});

describe("venueProblems", () => {
  const box = (id: string, x: number, y: number, extra: Partial<VenueArea> = {}): VenueArea => ({
    id,
    kind: "service",
    label: `Área ${id}`,
    quadrantId: null,
    rect: { x, y, width: 10, height: 10 },
    ...extra,
  });

  it("finds nothing wrong with a plan the server accepts", () => {
    const venue = { width: 100, height: 100, areas: [box("a", 0, 0), box("b", 10, 0), box("c", 0, 10, { kind: "stand", quadrantId: "ai" })] };

    expect(parseVenueMap(venue)).not.toBeNull();
    expect(venueProblems(venue).size).toBe(0);
  });

  it("points at each area with what is wrong with it", () => {
    const problems = venueProblems({
      width: 100,
      height: 100,
      areas: [
        box("a", 0, 0),
        box("b", 5, 5),
        box("c", 95, 0),
        box("d", 50, 50, { label: " x " }),
        box("e", 70, 70, { kind: "stand", quadrantId: null }),
        box("f", 30, 30, { rect: { x: 30, y: 30, width: 0, height: 5 } }),
      ],
    });

    expect(Object.fromEntries(problems)).toEqual({
      a: ["overlap"],
      b: ["overlap"],
      c: ["outside"],
      d: ["label"],
      e: ["no-quadrant"],
      f: ["outside"],
    });
  });
});