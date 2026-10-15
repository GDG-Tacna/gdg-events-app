// Public API (client-safe). Server-only exports live in `./server`.
export type { GalaxyMap, GalaxyQuadrant } from "./domain/galaxy";
export { QUADRANT_PLANETS, type Quadrant, type QuadrantError, type QuadrantErrorCode, type QuadrantPlanet } from "./domain/quadrant";
export type { MoveQuadrantAction, QuadrantAdminActionResult, SaveQuadrantAction, SaveVenueAction, SaveVenueActionResult, SeedLayoutAction, SetQuadrantActiveAction } from "./ui/admin-actions";
export type { AreaProblem } from "./domain/venue";
export { normalizeQuadrantName, normalizeQuadrantTagline } from "./domain/quadrant";
export type { QuadrantAdminErrorCode } from "./domain/manage";
export { QuadrantsAdminView, type QuadrantsAdminViewProps } from "./ui/QuadrantsAdminView";
export { QuadrantForm, type QuadrantFormProps } from "./ui/QuadrantForm";
export { VenueEditor, type VenueEditorProps } from "./ui/VenueEditor";
export { VenueMapView, type VenueMapViewProps } from "./ui/VenueMapView";
export { VENUE_AREA_KINDS, type VenueArea, type VenueAreaKind, type VenueMap, type VenueRect } from "./domain/venue";
