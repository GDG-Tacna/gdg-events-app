import "server-only";
import {
  CachedQuadrantSource,
  DEFAULT_QUADRANTS,
  DEFAULT_VENUE,
  FirestoreQuadrantStore,
  type GalaxyDeps,
} from "@/features/quadrants/server";
import { perEdition } from "./per-edition";

/** The edition's quadrants and plan, kept for a minute. Admin changes will invalidate it (phase 3, module 4). */
export const quadrantSource = perEdition(() => new CachedQuadrantSource(new FirestoreQuadrantStore()));

/** Composition root for the galaxy map: the stored layout, or the bundled fictional venue until there is one. */
export const galaxyDeps: GalaxyDeps = {
  source: quadrantSource,
  defaults: { quadrants: DEFAULT_QUADRANTS, venue: DEFAULT_VENUE },
};
