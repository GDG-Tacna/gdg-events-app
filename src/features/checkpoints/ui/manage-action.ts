import type { CheckpointKind } from "@/features/checkins";
import type { ImageRef } from "@/features/media/constants";
import type { TicketType } from "@/features/tickets";
import type { ManageErrorCode } from "../domain/manage-error";

export interface CheckpointView {
  id: string;
  kind: CheckpointKind;
  name: string;
  active: boolean;
  /** What the puesto is (empty when it has none). */
  description: string;
  /** Its logo or photo, or null. */
  image: ImageRef | null;
  /** The food gate of a meal (none for other kinds). */
  requirements: { minLevel: number | null; minTalks: number | null; minTicket: TicketType | null };
}

/**
 * Why a puesto's kind and id cannot change, as the page found it: a stand of the venue plan, check-ins there, a mission
 * that uses it, or an edition where this admin may not delete. The server checks again on save.
 */
export type CheckpointLockReason = "from-plan" | "has-check-ins" | "has-missions" | "edition-locked";

/** What the management actions answer to the admin screen. Plain data: it crosses the client boundary. */
export type ManageActionResult = { ok: true; checkpoint: CheckpointView } | { ok: false; code: ManageErrorCode };

/** Deleting answers with the name of what was deleted, for the message. */
export type DeleteCheckpointActionResult = { ok: true; name: string } | { ok: false; code: ManageErrorCode };
export type DeleteCheckpointAction = (input: { id: string }) => Promise<DeleteCheckpointActionResult>;
export type CreateCheckpointAction = (input: { name: string; id: string; kind: string; description?: string; imagePath?: string | null }) => Promise<ManageActionResult>;
/**
 * Saves the «Editar puesto» dialog. `imagePath` absent keeps the image (null removes it); `kind` and `newId` are sent
 * only when they change; `requirements` only for a catering puesto.
 */
export type EditCheckpointAction = (input: {
  id: string;
  name: string;
  description: string;
  imagePath?: string | null;
  kind?: string;
  newId?: string;
  requirements?: { minLevel: number | null; minTalks: number | null; minTicket: TicketType | null };
}) => Promise<ManageActionResult>;
export type SetCheckpointActiveAction = (input: { id: string; active: boolean }) => Promise<ManageActionResult>;
