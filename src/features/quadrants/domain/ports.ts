import type { Result } from "@/shared/lib/result";
import type { Quadrant } from "./quadrant";
import type { VenueMap } from "./venue";

/** What one edition has saved: its quadrants (active and inactive) and its venue plan, or none yet. */
export interface EditionLayout {
  quadrants: readonly Quadrant[];
  venue: VenueMap | null;
}

/** Where the edition's quadrants and plan are kept. A plan that cannot be drawn reads as `null`. */
export interface QuadrantSource {
  load(): Promise<Result<EditionLayout, { code: string }>>;
}
