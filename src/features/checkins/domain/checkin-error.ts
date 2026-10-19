export type CheckInErrorCode =
  /** The code is malformed, unknown, expired or not a DevFest code. Unknown ids look the same on purpose. */
  | "invalid-code"
  /** A genuine ephemeral code whose two minutes are over: the attendee should scan the one on screen now. */
  | "expired-code"
  | "checkpoint-inactive"
  /** A genuine speaker's code for someone no longer offered as a speaker of the edition. */
  | "speaker-inactive"
  /** A speaker scanning their own code: meeting them is for the cadets in the room, not for themselves. */
  | "own-speaker-code"
  | "not-registered"
  | "rate-limited"
  /** A cadet's contact code (phase 5): it belongs in the Red, not at a checkpoint. */
  | "contact-code"
  /** A printed station code (entrance, catering, stand): staff scan the cadet's pass there now. */
  | "staff-station"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface CheckInError {
  code: CheckInErrorCode;
}

export const checkInError = (code: CheckInErrorCode): CheckInError => ({ code });
