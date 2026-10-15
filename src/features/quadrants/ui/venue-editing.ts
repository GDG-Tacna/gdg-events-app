import type { VenueArea, VenueAreaKind, VenueMap, VenueRect } from "../domain/venue";

/** Pure edits of a plan being drawn in the editor. Every result stays inside the plan and on whole units. */

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Keeps a rectangle inside the plan: at least 1 unit, never past an edge. */
export function fitRect(rect: VenueRect, plan: Pick<VenueMap, "width" | "height">): VenueRect {
  const width = clamp(Math.round(rect.width), 1, plan.width);
  const height = clamp(Math.round(rect.height), 1, plan.height);
  return {
    x: clamp(Math.round(rect.x), 0, plan.width - width),
    y: clamp(Math.round(rect.y), 0, plan.height - height),
    width,
    height,
  };
}

const replace = (venue: VenueMap, id: string, change: (area: VenueArea) => VenueArea): VenueMap => ({
  ...venue,
  areas: venue.areas.map((area) => (area.id === id ? change(area) : area)),
});

/** Moves an area to a position (its size kept), held inside the plan. */
export const moveAreaTo = (venue: VenueMap, id: string, x: number, y: number) =>
  replace(venue, id, (area) => ({ ...area, rect: fitRect({ ...area.rect, x, y }, venue) }));

/** Moves an area by a number of units. */
export const moveAreaBy = (venue: VenueMap, id: string, dx: number, dy: number) =>
  replace(venue, id, (area) => ({ ...area, rect: fitRect({ ...area.rect, x: area.rect.x + dx, y: area.rect.y + dy }, venue) }));

/** Resizes an area from its top-left corner, held inside the plan and at least 1 unit. */
export const resizeAreaTo = (venue: VenueMap, id: string, width: number, height: number) =>
  replace(venue, id, (area) => {
    const w = clamp(Math.round(width), 1, venue.width - area.rect.x);
    const h = clamp(Math.round(height), 1, venue.height - area.rect.y);
    return { ...area, rect: { ...area.rect, width: w, height: h } };
  });

export const resizeAreaBy = (venue: VenueMap, id: string, dw: number, dh: number) => {
  const area = venue.areas.find((candidate) => candidate.id === id);
  return area ? resizeAreaTo(venue, id, area.rect.width + dw, area.rect.height + dh) : venue;
};

/** Changes an area's label, kind or quadrant. Only stands keep a quadrant. */
export const updateArea = (venue: VenueMap, id: string, change: Partial<Pick<VenueArea, "label" | "kind" | "quadrantId">>) =>
  replace(venue, id, (area) => {
    const kind: VenueAreaKind = change.kind ?? area.kind;
    const quadrantId = kind === "stand" ? (change.quadrantId !== undefined ? change.quadrantId : area.quadrantId) : null;
    return { ...area, ...change, kind, quadrantId };
  });

export const removeArea = (venue: VenueMap, id: string): VenueMap => ({ ...venue, areas: venue.areas.filter((area) => area.id !== id) });

/** A plan of another size: areas that no longer fit are pulled back inside (and shrunk if needed). */
export const resizePlan = (venue: VenueMap, width: number, height: number): VenueMap => {
  const plan = { width, height };
  return { ...venue, width, height, areas: venue.areas.map((area) => ({ ...area, rect: fitRect(area.rect, plan) })) };
};

/** An id from a label, unique in the plan: "Stand nuevo" becomes "stand-nuevo", then "stand-nuevo-2". */
export function areaIdFor(label: string, venue: VenueMap): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34)
      .replace(/-+$/g, "") || "area";
  const taken = new Set(venue.areas.map((area) => area.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const overlaps = (a: VenueRect, b: VenueRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Adds an area in the first free spot that fits it (scanning from the top left), or at the top left when
 * the plan is full (the editor then points at the overlap). Returns the plan and the new area's id.
 */
export function addArea(
  venue: VenueMap,
  area: { label: string; kind: VenueAreaKind; quadrantId: string | null; width: number; height: number },
): { venue: VenueMap; id: string } {
  const id = areaIdFor(area.label, venue);
  const size = { width: Math.min(area.width, venue.width), height: Math.min(area.height, venue.height) };
  let spot = { x: 0, y: 0 };
  search: for (let y = 0; y + size.height <= venue.height; y += 1) {
    for (let x = 0; x + size.width <= venue.width; x += 1) {
      const rect = { x, y, ...size };
      if (!venue.areas.some((other) => overlaps(other.rect, rect))) {
        spot = { x, y };
        break search;
      }
    }
  }
  const added: VenueArea = {
    id,
    kind: area.kind,
    label: area.label,
    quadrantId: area.kind === "stand" ? area.quadrantId : null,
    rect: { ...spot, ...size },
  };
  return { venue: { ...venue, areas: [...venue.areas, added] }, id };
}
