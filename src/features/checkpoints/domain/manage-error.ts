export type ManageErrorCode =
  | "invalid-name"
  | "invalid-id"
  | "invalid-kind"
  /** A food gate level outside 1..10, or talks outside 0..50. */
  | "invalid-level"
  | "invalid-talks"
  /** Only catering checkpoints have a food gate. */
  | "not-catering"
  | "already-exists"
  /** Cadets already checked in there: it can only be closed (the history needs it). */
  | "has-check-ins"
  /** A mission points at it: those change or go first. */
  | "has-missions"
  /** The edition is published or over: only an admin of every edition deletes there. */
  | "edition-locked"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface ManageError {
  code: ManageErrorCode;
}

export const manageError = (code: ManageErrorCode): ManageError => ({ code });
