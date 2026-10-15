import { describe, expect, it } from "vitest";
import type { VenueArea, VenueMap } from "../domain/venue";
import { addArea, areaIdFor, fitRect, moveAreaBy, moveAreaTo, removeArea, resizeAreaBy, resizeAreaTo, resizePlan, updateArea } from "./venue-editing";

const area = (id: string, x: number, y: number, extra: Partial<VenueArea> = {}): VenueArea => ({
  id,
  kind: "stand",
  label: `Stand ${id}`,
  quadrantId: "ai",
  rect: { x, y, width: 10, height: 10 },
  ...extra,
});
const PLAN: VenueMap = { width: 50, height: 40, areas: [area("a", 0, 0), area("b", 20, 20)] };
const rectOf = (venue: VenueMap, id: string) => venue.areas.find((candidate) => candidate.id === id)!.rect;

describe("venue editing", () => {
  it("keeps a rectangle inside the plan, on whole units, at least 1 wide", () => {
    expect(fitRect({ x: -3, y: 45, width: 10.4, height: 0 }, PLAN)).toEqual({ x: 0, y: 39, width: 10, height: 1 });
    expect(fitRect({ x: 48, y: 0, width: 80, height: 5 }, PLAN)).toEqual({ x: 0, y: 0, width: 50, height: 5 });
  });

  it("moves an area to a place or by some units, never past an edge, keeping its size", () => {
    expect(rectOf(moveAreaTo(PLAN, "b", 45, 35), "b")).toEqual({ x: 40, y: 30, width: 10, height: 10 });
    expect(rectOf(moveAreaBy(PLAN, "a", -1, 3), "a")).toEqual({ x: 0, y: 3, width: 10, height: 10 });
    expect(rectOf(moveAreaBy(PLAN, "a", 2, 0), "b")).toEqual(rectOf(PLAN, "b"));
  });

  it("resizes from the top-left corner, at least 1 unit and never past an edge", () => {
    expect(rectOf(resizeAreaTo(PLAN, "b", 100, 0), "b")).toEqual({ x: 20, y: 20, width: 30, height: 1 });
    expect(rectOf(resizeAreaBy(PLAN, "a", 1, -1), "a")).toEqual({ x: 0, y: 0, width: 11, height: 9 });
    expect(resizeAreaBy(PLAN, "ghost", 1, 1)).toEqual(PLAN);
  });

  it("changes label, kind and quadrant; only stands keep a quadrant", () => {
    const hall = updateArea(PLAN, "a", { kind: "auditorium", label: "Auditorio" }).areas[0];
    expect(hall).toMatchObject({ kind: "auditorium", label: "Auditorio", quadrantId: null });

    expect(updateArea(PLAN, "a", { quadrantId: "cloud" }).areas[0].quadrantId).toBe("cloud");
    expect(updateArea(PLAN, "a", { label: "Otro" }).areas[0].quadrantId).toBe("ai");
  });

  it("removes an area", () => {
    expect(removeArea(PLAN, "a").areas.map((candidate) => candidate.id)).toEqual(["b"]);
  });

  it("pulls areas back inside a smaller plan", () => {
    const small = resizePlan(PLAN, 25, 25);
    expect([small.width, small.height]).toEqual([25, 25]);
    expect(rectOf(small, "b")).toEqual({ x: 15, y: 15, width: 10, height: 10 });
  });

  it("keeps the real plan under a resized grid", () => {
    const background = { path: "public/e/venue-plan/x1234567.svg", url: "https://cdn/p.svg" };

    expect(resizePlan({ ...PLAN, background }, 30, 20).background).toEqual(background);
  });

  it("makes unique ids from labels", () => {
    const venue = { ...PLAN, areas: [area("stand-nuevo", 0, 0), area("stand-nuevo-2", 20, 0)] };
    expect(areaIdFor("Stand nuevo", venue)).toBe("stand-nuevo-3");
    expect(areaIdFor("Café & Té", PLAN)).toBe("cafe-te");
    expect(areaIdFor("¡¡!!", PLAN)).toBe("area");
  });

  it("adds an area in the first free spot, or at the top left when nothing fits", () => {
    const added = addArea(PLAN, { label: "Stand nuevo", kind: "stand", quadrantId: "ai", width: 10, height: 10 });
    expect(added.id).toBe("stand-nuevo");
    expect(rectOf(added.venue, "stand-nuevo")).toEqual({ x: 10, y: 0, width: 10, height: 10 });

    const service = addArea(PLAN, { label: "Baños", kind: "service", quadrantId: "ai", width: 10, height: 10 });
    expect(service.venue.areas.at(-1)?.quadrantId).toBeNull();

    const full = { width: 10, height: 10, areas: [area("x", 0, 0)] };
    expect(rectOf(addArea(full, { label: "Más", kind: "stand", quadrantId: "ai", width: 20, height: 20 }).venue, "mas")).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});
