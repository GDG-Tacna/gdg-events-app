export type ServeErrorCode =
  | "invalid-code"
  /** A genuine pass whose minute is over: ask the attendee to open their pass again. */
  | "expired-code"
  | "checkpoint-not-found"
  | "checkpoint-inactive"
  /** Staff scan only at stations (entrance, catering, stands); a talk is scanned by the cadet. */
  | "not-station"
  /** The pass is genuine but the person has no profile in this edition. */
  | "attendee-not-found"
  /** The attendee does not meet the conditions of this meal (its food gate); `missing` says what. */
  | "not-eligible"
  | "rate-limited"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface ServeError {
  code: ServeErrorCode;
  /** Only with `not-eligible`: the level to reach and the talks still missing. */
  missing?: { level: number | null; talks: number | null };
}

export const serveError = (code: ServeErrorCode, missing?: ServeError["missing"]): ServeError => (missing ? { code, missing } : { code });
