import type { AliasErrorCode } from "../domain/alias";
import type { AttendeeErrorCode } from "../domain/attendee-error";

/** What the onboarding form sends. Only the alias comes from the user. */
export interface RegisterAttendeeInput {
  alias: string;
}

/** Serializable result of the server action (it crosses the server/client boundary). */
export type RegisterAttendeeActionResult =
  | { ok: true; created: boolean }
  | { ok: false; code: AttendeeErrorCode; alias?: AliasErrorCode };

/** The server action the app shell injects into the form. */
export type RegisterAttendeeAction = (input: RegisterAttendeeInput) => Promise<RegisterAttendeeActionResult>;
