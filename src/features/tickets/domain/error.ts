export type TicketsErrorCode =
  | "invalid-ticket"
  | "invalid-rows"
  /** More rows than one import takes. */
  | "too-many-rows"
  | "not-found"
  /** The staff's search text is shorter than the search takes. */
  | "invalid-search"
  /** The staff screen scanned a code that is not a live pass of a cadet (see the serve errors of the same names). */
  | "invalid-code"
  | "expired-code"
  | "attendee-not-found"
  | "rate-limited"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface TicketsError {
  code: TicketsErrorCode;
}

export const ticketsError = (code: TicketsErrorCode): TicketsError => ({ code });
