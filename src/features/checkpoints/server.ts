import "server-only";

// Public API (server-only). Client code must import from "@/features/checkpoints" instead.
export type {
  AttendeeLookup,
  AttendeeSummary,
  CheckpointLookup,
  PassCheck,
  RationCounter,
  GateShortfall,
  GateVerdict,
  ServeCheckpoint,
  ServeGate,
  ServeLimiter,
  ServeRecorder,
} from "./domain/ports";
export {
  STATION_KINDS,
  getServePoint,
  isStationKind,
  listServePoints,
  serveAttendee,
  type StationKind,
  type ServeActor,
  type ServeDeps,
  type ServePoint,
  type ServeResult,
} from "./domain/serve";
export {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  createCheckpoint,
  listCheckpoints,
  normalizeName,
  renameCheckpoint,
  setCheckpointActive,
  setFoodRequirements,
  suggestId,
  type CheckpointStore,
  type ManageActor,
  type ManageAudit,
  type ManageAuditEntry,
  type ManageDeps,
  type ManagedCheckpoint,
} from "./domain/manage";
export {
  FOOD_LEVEL_MAX,
  FOOD_TALKS_MAX,
  FoodGate,
  NO_FOOD_REQUIREMENTS,
  checkFoodRequirements,
  foodShortfall,
  hasFoodRequirements,
  parseFoodRequirements,
  type FoodGateDeps,
  type FoodRequirements,
  type FoodShortfall,
} from "./domain/food-gate";
export { AllowAllServeGate } from "./data/allow-all-serve-gate";
export { FirestoreCheckpointStore } from "./data/server/firestore-checkpoint-store";
