// Public API (client-safe). Server-only exports live in `./server`.
export * from "./domain/catalog";
export { DEFAULT_MINIGAME_SETTINGS, parseMinigameSettings, type MinigameAdminErrorCode, type MinigameSettings } from "./domain/settings";
export type { MinigameErrorCode, MinigameOffer, MinigameTicket } from "./domain/plays";
export type { FinishMinigameAction, FinishMinigameActionResult, StartMinigameAction, StartMinigameActionResult } from "./ui/play-actions";
export { MinigamePlayer, type MinigamePlayerProps } from "./ui/MinigamePlayer";
export { MinigameOfferCard, type MinigameOfferCardProps } from "./ui/MinigameOfferCard";
export { MinigameSettingsView, type MinigameSettingsViewProps } from "./ui/MinigameSettingsView";
export type { SaveMinigameSettingsAction, SaveMinigameSettingsActionResult } from "./ui/settings-actions";
