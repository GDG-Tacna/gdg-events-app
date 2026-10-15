import type { QuadrantAdminErrorCode } from "../domain/manage";
import type { VenueMap } from "../domain/venue";

/** What the quadrant management actions answer. The screens refresh after a success. */
export type QuadrantAdminActionResult = { ok: true } | { ok: false; code: QuadrantAdminErrorCode };

/** Saving the plan also says which stand QR codes it created, and which it could not. */
export type SaveVenueActionResult = { ok: true; standQrs: string[]; failedQrs: string[] } | { ok: false; code: QuadrantAdminErrorCode };

export type SeedLayoutAction = () => Promise<SaveVenueActionResult>;
export type SaveQuadrantAction = (input: { id: string; name: string; tagline: string; planet: string }) => Promise<QuadrantAdminActionResult>;
export type SetQuadrantActiveAction = (input: { id: string; active: boolean }) => Promise<QuadrantAdminActionResult>;
export type MoveQuadrantAction = (input: { id: string; to: number }) => Promise<QuadrantAdminActionResult>;
/** The plan to save, with the background it keeps (its path) or null for none. */
export type SaveVenueAction = (venue: VenueMap & { backgroundPath?: string | null }) => Promise<SaveVenueActionResult>;
