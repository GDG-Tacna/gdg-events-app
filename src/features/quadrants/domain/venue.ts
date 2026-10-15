import type { ImageRef } from "@/features/media/constants";

export const VENUE_AREA_KINDS = ["auditorium", "stand", "entrance", "catering", "service"] as const;
export type VenueAreaKind = (typeof VENUE_AREA_KINDS)[number];

/** A rectangle in plan units (the plan is a grid of `width` by `height` units, origin at the top left). */
export interface VenueRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A place on the venue plan. Stands belong to a quadrant; other areas never do. */
export interface VenueArea {
  id: string;
  kind: VenueAreaKind;
  label: string;
  quadrantId: string | null;
  rect: VenueRect;
}

/** The venue plan of one edition, as data: each edition can swap in its own venue. */
export interface VenueMap {
  width: number;
  height: number;
  areas: readonly VenueArea[];
  /** The venue's real plan (an uploaded SVG or image), stretched under the grid; absent when there is none. */
  background?: ImageRef | null;
}

export const VENUE_MIN_SIZE = 10;
export const VENUE_MAX_SIZE = 400;
export const VENUE_MAX_AREAS = 60;
/** At least 2 characters: a stand's label also names its checkpoint, which needs 2. */
export const VENUE_LABEL_MIN = 2;
export const VENUE_LABEL_MAX = 40;

const AREA_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const overlaps = (a: VenueRect, b: VenueRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function parseArea(input: unknown, width: number, height: number): VenueArea | null {
  if (!isRecord(input) || !isRecord(input.rect)) return null;
  const { id, kind, label, quadrantId, rect } = input as Record<string, unknown> & { rect: Record<string, unknown> };
  if (typeof id !== "string" || !AREA_ID_PATTERN.test(id)) return null;
  if (typeof kind !== "string" || !(VENUE_AREA_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  if (trimmed.length < VENUE_LABEL_MIN || trimmed.length > VENUE_LABEL_MAX) return null;

  const { x, y, width: w, height: h } = rect;
  if (!isIntIn(x, 0, width - 1) || !isIntIn(y, 0, height - 1)) return null;
  if (!isIntIn(w, 1, width - x) || !isIntIn(h, 1, height - y)) return null;

  let quadrant: string | null = null;
  if (kind === "stand") {
    if (typeof quadrantId !== "string" || quadrantId.length === 0) return null;
    quadrant = quadrantId;
  }
  return { id, kind: kind as VenueAreaKind, label: trimmed, quadrantId: quadrant, rect: { x, y, width: w, height: h } };
}

/**
 * Reads a venue plan from stored or admin-submitted data. `null` when it cannot be drawn: a size out of
 * range, an area outside the plan, two areas with the same id or on top of each other, or a stand without
 * a quadrant. Whether the quadrant exists is checked where the quadrants are known (`getGalaxyMap`).
 */
export function parseVenueMap(input: unknown): VenueMap | null {
  if (!isRecord(input)) return null;
  const { width, height, areas } = input;
  if (!isIntIn(width, VENUE_MIN_SIZE, VENUE_MAX_SIZE) || !isIntIn(height, VENUE_MIN_SIZE, VENUE_MAX_SIZE)) return null;
  if (!Array.isArray(areas) || areas.length === 0 || areas.length > VENUE_MAX_AREAS) return null;

  const parsed: VenueArea[] = [];
  const ids = new Set<string>();
  for (const raw of areas) {
    const area = parseArea(raw, width, height);
    if (!area || ids.has(area.id)) return null;
    if (parsed.some((other) => overlaps(other.rect, area.rect))) return null;
    ids.add(area.id);
    parsed.push(area);
  }
  return { width, height, areas: parsed };
}

export type AreaProblem = "label" | "outside" | "overlap" | "no-quadrant";

/**
 * What is wrong with each area of a plan being edited, so the editor can point at it before saving (the
 * same rules `parseVenueMap` applies on the server). Areas without problems are not listed.
 */
export function venueProblems(venue: VenueMap): ReadonlyMap<string, readonly AreaProblem[]> {
  const problems = new Map<string, AreaProblem[]>();
  const add = (id: string, problem: AreaProblem) => {
    const list = problems.get(id) ?? [];
    if (!list.includes(problem)) list.push(problem);
    problems.set(id, list);
  };

  venue.areas.forEach((area, index) => {
    const label = area.label.trim();
    if (label.length < VENUE_LABEL_MIN || label.length > VENUE_LABEL_MAX) add(area.id, "label");
    const { x, y, width, height } = area.rect;
    if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > venue.width || y + height > venue.height) add(area.id, "outside");
    if (area.kind === "stand" && !area.quadrantId) add(area.id, "no-quadrant");
    for (const other of venue.areas.slice(index + 1)) {
      if (overlaps(area.rect, other.rect)) {
        add(area.id, "overlap");
        add(other.id, "overlap");
      }
    }
  });
  return problems;
}
