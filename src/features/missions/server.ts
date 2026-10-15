import "server-only";

// Public API (server-only). Client code must import from "@/features/missions" instead.
export {
  getMissionBoard,
  missionError,
  completeByCheckpoint,
  submitMissionProof,
  type ScanMission,
  type BoardMission,
  type MissionBoard,
  type MissionError,
  type MissionErrorCode,
  type MissionReadDeps,
  type SubmitOutcome,
  type SubmitProofDeps,
} from "./domain/use-cases";
export { evaluate, type MissionCompletion, type MissionProof } from "./domain/completion";
export { DEFAULT_XP, MISSION_TYPES, parseMission, type Mission, type MissionConfig, type MissionType } from "./domain/mission";
export type { AttemptLimiter, CompletionStore, CreditRules, MissionSource, XpGranter } from "./domain/ports";
export {
  createMission,
  listManagedMissions,
  missionAdminError,
  moveMission,
  seedMissions,
  setMissionActive,
  updateMission,
  type CheckpointDirectory,
  type MissionAdminActor,
  type MissionAdminDeps,
  type MissionAdminError,
  type MissionAdminErrorCode,
  type MissionAudit,
  type MissionDraft,
  type MissionStore,
  type QuadrantDirectory,
} from "./domain/manage";
export { checkMission } from "./domain/mission";
export { DEFAULT_MISSIONS } from "./data/default-missions";
export { FirestoreMissionStore } from "./data/server/firestore-mission-store";
export { CachedMissionSource } from "./data/server/cached-mission-source";
export { FirestoreCompletionStore } from "./data/server/firestore-completion-store";
export { FirestoreMissionSource } from "./data/server/firestore-mission-source";
export {
  SUGGESTABLE_TYPES,
  suggestMissions,
  type MissionSuggester,
  type QuadrantList,
  type SuggestDeps,
  type SuggestErrorCode,
  type SuggestedMission,
  type SuggestionRequest,
} from "./domain/suggest";
export { GeminiMissionSuggester } from "./data/server/gemini-mission-suggester";
