import type { CheckpointKind } from "@/features/checkins";
import type { ManageErrorCode } from "../domain/manage-error";

export interface CheckpointView {
  id: string;
  kind: CheckpointKind;
  name: string;
  active: boolean;
  /** The food gate of a meal (none for other kinds). */
  requirements: { minLevel: number | null; minTalks: number | null };
}

/** What the management actions answer to the admin screen. Plain data: it crosses the client boundary. */
export type ManageActionResult = { ok: true; checkpoint: CheckpointView } | { ok: false; code: ManageErrorCode };

export type CreateCheckpointAction = (input: { name: string; id: string; kind: string }) => Promise<ManageActionResult>;
export type RenameCheckpointAction = (input: { id: string; name: string }) => Promise<ManageActionResult>;
export type SetFoodRequirementsAction = (input: { id: string; minLevel: number | null; minTalks: number | null }) => Promise<ManageActionResult>;
export type SetCheckpointActiveAction = (input: { id: string; active: boolean }) => Promise<ManageActionResult>;
