import type { QuadrantPlanet } from "../domain/quadrant";
import type { VenueAreaKind } from "../domain/venue";

/** Each quadrant wears the Design System accent closest to its planet (borders and rings, never text on dark). */
export const PLANET_ACCENT: Record<QuadrantPlanet, string> = {
  cloud: "border-cyan",
  firebase: "border-gold",
  android: "border-lime",
  ai: "border-violet",
  gdg: "border-magenta",
};

/** How the areas that are not stands look on the plan (the map and the editor draw them the same way). */
export const AREA_STYLE: Record<Exclude<VenueAreaKind, "stand">, string> = {
  auditorium: "bg-bg-violet border-violet",
  catering: "bg-surface border-gold",
  entrance: "bg-surface border-lime",
  service: "bg-surface-raised border-line-strong",
};

/** A plan coordinate as a share of the plan, without float noise (28%, not 28.000000000000004%). */
export const percent = (value: number, total: number) => `${Number(((value / total) * 100).toFixed(4))}%`;
