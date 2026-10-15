// Public API (client-safe). Server-only exports live in `./server`.
export type { ServeError, ServeErrorCode } from "./domain/serve-error";
export { STATION_KINDS, isStationKind, type StationKind } from "./domain/serve";
export type { ServeAction, ServeActionResult, StationMission } from "./ui/action";
export type { ManageError, ManageErrorCode } from "./domain/manage-error";
export type {
  CheckpointView,
  CreateCheckpointAction,
  ManageActionResult,
  RenameCheckpointAction,
  SetCheckpointActiveAction,
  SetFoodRequirementsAction,
} from "./ui/manage-action";
export {
  FOOD_LEVEL_MAX,
  FOOD_TALKS_MAX,
  NO_FOOD_REQUIREMENTS,
  checkFoodRequirements,
  hasFoodRequirements,
  type FoodRequirements,
  type FoodShortfall,
} from "./domain/food-gate";
export { NAME_MAX_LENGTH, NAME_MIN_LENGTH, normalizeName, suggestId } from "./domain/manage";
export { CheckpointsAdminView, type CheckpointsAdminViewProps } from "./ui/CheckpointsAdminView";
export { ServeScreen, type ServeScreenProps } from "./ui/ServeScreen";
