import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionLayout, QuadrantSource } from "./ports";
import { quadrantError, type Quadrant, type QuadrantError } from "./quadrant";
import type { VenueArea, VenueMap } from "./venue";

/** An active quadrant with the stands that belong to it, in plan order. */
export interface GalaxyQuadrant extends Quadrant {
  stands: readonly VenueArea[];
}

/** What the attendee map shows: the plan, and the active quadrants in order. */
export interface GalaxyMap {
  venue: VenueMap;
  quadrants: readonly GalaxyQuadrant[];
}

export interface GalaxyDeps {
  source: QuadrantSource;
  /** The bundled quadrants and plan, served until the edition saves its own. */
  defaults: { quadrants: readonly Quadrant[]; venue: VenueMap };
}

const byOrder = (a: Quadrant, b: Quadrant) => a.order - b.order || a.name.localeCompare(b.name);

/**
 * The galaxy map of the active edition. Until the admin saves quadrants or a plan, the bundled ones are
 * used, so the map works from the first day. Only active quadrants are shown; a stand whose quadrant is
 * inactive or unknown stays on the plan as a plain stand (it is still a place in the venue).
 */
export async function getGalaxyMap(deps: GalaxyDeps): Promise<Result<GalaxyMap, QuadrantError>> {
  const loaded = await deps.source.load();
  if (!loaded.ok) return err(quadrantError("unknown"));
  return ok(buildGalaxy(loaded.value, deps.defaults));
}

function buildGalaxy(layout: EditionLayout, defaults: GalaxyDeps["defaults"]): GalaxyMap {
  const quadrants = layout.quadrants.length > 0 ? layout.quadrants : defaults.quadrants;
  const venue = layout.venue ?? defaults.venue;

  const active = quadrants.filter((quadrant) => quadrant.active).sort(byOrder);
  const activeIds = new Set(active.map((quadrant) => quadrant.id));
  const areas = venue.areas.map((area) =>
    area.quadrantId !== null && !activeIds.has(area.quadrantId) ? { ...area, quadrantId: null } : area,
  );

  return {
    venue: { ...venue, areas },
    quadrants: active.map((quadrant) => ({ ...quadrant, stands: areas.filter((area) => area.quadrantId === quadrant.id) })),
  };
}
