import "server-only";

// Public API (server-only). Client code must import from "@/features/quadrants" instead.
export { getGalaxyMap, type GalaxyDeps, type GalaxyMap, type GalaxyQuadrant } from "./domain/galaxy";
export type { EditionLayout, QuadrantSource } from "./domain/ports";
export type { Quadrant, QuadrantError } from "./domain/quadrant";
export { parseVenueMap, type VenueArea, type VenueMap } from "./domain/venue";
export {
  createQuadrant,
  getVenueForEdit,
  listManagedQuadrants,
  moveQuadrant,
  saveVenue,
  seedLayout,
  setQuadrantActive,
  standCheckpointId,
  updateQuadrant,
  type QuadrantAdminActor,
  type QuadrantAdminDeps,
  type QuadrantAdminErrorCode,
  type QuadrantAdminStore,
  type QuadrantAudit,
  type StandCheckpoints,
  type VenueForEdit,
} from "./domain/manage";
export { DEFAULT_QUADRANTS, DEFAULT_VENUE } from "./data/default-layout";
export { CachedQuadrantSource } from "./data/server/cached-quadrant-source";
export { FirestoreQuadrantStore } from "./data/server/firestore-quadrant-store";
