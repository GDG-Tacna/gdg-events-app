import type { AliasErrorCode } from "./alias";

export type AttendeeErrorCode = "alias-invalid" | "alias-taken" | "unauthenticated" | "forbidden" | "unknown";

export interface AttendeeError {
  code: AttendeeErrorCode;
  /** Present when `code` is `alias-invalid`: which rule the alias broke. */
  alias?: AliasErrorCode;
}

export const attendeeError = (code: AttendeeErrorCode, alias?: AliasErrorCode): AttendeeError =>
  alias ? { code, alias } : { code };
