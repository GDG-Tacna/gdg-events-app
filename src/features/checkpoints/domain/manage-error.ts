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
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface ManageError {
  code: ManageErrorCode;
}

export const manageError = (code: ManageErrorCode): ManageError => ({ code });
