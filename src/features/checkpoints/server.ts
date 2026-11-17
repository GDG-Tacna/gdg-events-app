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
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  createCheckpoint,
  deleteCheckpoint,
  editCheckpoint,
  listCheckpoints,
  listIdentityLocks,
  normalizeDescription,
  normalizeName,
  setCheckpointActive,
  suggestId,
  type CheckpointPatch,
  type CheckpointStore,
  type EditCheckpointInput,
  type IdentityLock,
  type PlanStands,
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
export {
  STAFF_SCOPE_MAX,
  listStaffScopes,
  setStaffScope,
  staffScopeError,
  type StaffScopeAudit,
  type StaffScopeAuditEntry,
  type StaffScopeDeps,
  type StaffScopeError,
  type StaffScopeStore,
} from "./domain/staff-scope";
export { AllowAllServeGate } from "./data/allow-all-serve-gate";
export { FirestoreCheckpointStore } from "./data/server/firestore-checkpoint-store";
export { FirestoreStaffScopeStore } from "./data/server/firestore-staff-scope-store";
