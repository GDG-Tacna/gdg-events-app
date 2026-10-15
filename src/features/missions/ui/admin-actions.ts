import type { MissionAdminErrorCode, MissionDraft } from "../domain/manage";
import type { MinigameDifficulty } from "../domain/mission";

/** What the mission management actions answer. The screens refresh their list after a success. */
export type MissionAdminActionResult = { ok: true } | { ok: false; code: MissionAdminErrorCode };

export type SeedMissionsAction = () => Promise<MissionAdminActionResult>;
export type SaveMissionAction = (input: { id: string; draft: MissionDraft }) => Promise<MissionAdminActionResult>;
export type SetMissionActiveAction = (input: { id: string; active: boolean }) => Promise<MissionAdminActionResult>;
export type MoveMissionAction = (input: { id: string; to: number }) => Promise<MissionAdminActionResult>;

/** A quadrant or a checkpoint as the admin forms list them. */
export interface AdminOption {
  id: string;
  name: string;
}

/** A mini-game as the mission form offers it: whether the edition offers it, and at which difficulty. */
export interface MinigameOption extends AdminOption {
  enabled: boolean;
  difficulty: MinigameDifficulty;
}
