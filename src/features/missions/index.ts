// Public API (client-safe). Server-only exports live in `./server`.
export type { BoardMission, MissionBoard, MissionError, MissionErrorCode, SubmitOutcome } from "./domain/use-cases";
export { MissionsAdminView, type MissionsAdminViewProps } from "./ui/MissionsAdminView";
export { MissionForm, type MissionFormProps } from "./ui/MissionForm";
export { SuggestMissionsView, type SuggestMissionsViewProps } from "./ui/SuggestMissionsView";
export { MissionDetailView, type MissionDetailViewProps } from "./ui/MissionDetailView";
export { MissionBoardView, type BoardQuadrant, type MissionBoardViewProps } from "./ui/MissionBoardView";
export type { MissionAnswer, SubmitMissionAction, SubmitMissionActionResult } from "./ui/answer-action";
export type { AdminOption, MinigameOption, MissionAdminActionResult, MoveMissionAction, SaveMissionAction, SeedMissionsAction, SetMissionActiveAction } from "./ui/admin-actions";
export type { MissionAdminErrorCode, MissionDraft } from "./domain/manage";
export { checkMission, DEFAULT_XP, MINIGAME_DIFFICULTIES, type MinigameDifficulty, type Mission, type MissionConfig } from "./domain/mission";
export type { SuggestMissionsAction, SuggestMissionsActionResult } from "./ui/suggest-action";
export type { SuggestErrorCode, SuggestedMission } from "./domain/suggest";
export { SUGGESTABLE_TYPES, SUGGEST_COUNT_MAX, SUGGEST_TOPIC_MAX, SUGGEST_TOPIC_MIN } from "./domain/suggest";
export type { CompletionStatus } from "./domain/completion";
export { MISSION_TYPES, QUIZ_ATTEMPTS, type MissionType, type PublicMissionConfig } from "./domain/mission";
