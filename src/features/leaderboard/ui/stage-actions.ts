import type { StageCommand, StageErrorCode } from "../domain/stage";

/** What a stage command answers. The screen refreshes after a success. */
export type UpdateStageActionResult = { ok: true } | { ok: false; code: StageErrorCode };
export type UpdateStageAction = (command: StageCommand) => Promise<UpdateStageActionResult>;
