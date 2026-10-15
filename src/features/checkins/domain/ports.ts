import type { Result } from "@/shared/lib/result";
import type { CheckInError } from "./checkin-error";
import type { Checkpoint, CheckpointId } from "./checkpoint";

export interface CheckpointCatalog {
  /** `null` when the checkpoint does not exist. */
  find(id: CheckpointId): Promise<Result<Checkpoint | null, CheckInError>>;
  /** Checkpoints that accept scans, ordered by name. */
  listActive(): Promise<Result<readonly Checkpoint[], CheckInError>>;
}

export type RecordOutcome =
  | { kind: "recorded"; /** True when this scan registered the attendee at the event. */ firstEntrance: boolean }
  | { kind: "already-recorded" };

export interface CheckInRepository {
  /**
   * Atomically stores the check-in unless `{uid}_{checkpoint}` already exists. Fails with
   * `not-registered` when the attendee has no profile. A repeated call changes nothing.
   */
  record(input: { uid: string; checkpoint: Checkpoint; at: Date }): Promise<Result<RecordOutcome, CheckInError>>;
}

/** How many check-ins a checkpoint has, for example the rations handed out at lunch. */
export interface CheckInCounter {
  count(checkpointId: CheckpointId): Promise<Result<number, CheckInError>>;
}

/** Where a verified code came from: printed on paper, or shown on screen and signed with a short life. */
export type QrSource = "static" | "ephemeral";

export interface VerifiedScan {
  checkpointId: CheckpointId;
  source: QrSource;
}

/**
 * Turns what a QR code contained into the checkpoint it points to, and says where the code came from.
 * Printed codes are one adapter; the ephemeral signed codes are another.
 */
export interface QrPayloadVerifier {
  verify(payload: string): Promise<Result<VerifiedScan, CheckInError>>;
}

/** Limits how fast one attendee can try codes, which stops guessing and scripted scanning. */
export interface AttemptLimiter {
  /** Counts one attempt; `false` means the attendee is over the limit. */
  consume(uid: string): Promise<boolean>;
}

