import type { MinigameAdminErrorCode, MinigameSettings } from "../domain/settings";

/** What saving the Mini-juegos screen answers. The screen refreshes after a success. */
export type SaveMinigameSettingsActionResult = { ok: true } | { ok: false; code: MinigameAdminErrorCode };
export type SaveMinigameSettingsAction = (settings: MinigameSettings) => Promise<SaveMinigameSettingsActionResult>;
