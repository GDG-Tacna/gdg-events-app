import "server-only";

// Public API (server-only). Client code must import from "@/features/minigames" instead.
export * from "./domain/catalog";
export {
  DEFAULT_MINIGAME_SETTINGS,
  getMinigameSettings,
  getMinigameSettingsForEdit,
  parseMinigameSettings,
  saveMinigameSettings,
  type MinigameAdminDeps,
  type MinigameAdminErrorCode,
  type MinigameSettings,
  type MinigameSettingsStore,
} from "./domain/settings";
export {
  decideFinish,
  finishMinigame,
  getMinigameOffer,
  playId,
  startMinigame,
  type MinigameDeps,
  type MinigameErrorCode,
  type MinigameOffer,
  type MinigamePlay,
  type MinigameTicket,
  type MissionBonusInfo,
  type PlayStatus,
  type PlayStore,
} from "./domain/plays";
export { FirestoreMinigameStore } from "./data/server/firestore-minigame-store";
