// Public API (client-safe). Server-only exports live in `./server`.
export { CHECKPOINT_KINDS, isCheckpointId, isCheckpointKind, type CheckpointId, type CheckpointKind } from "./domain/checkpoint";
export type { CheckInError, CheckInErrorCode } from "./domain/checkin-error";
export type { RecordCheckInAction, RecordCheckInActionResult, ScanReward } from "./ui/action";
