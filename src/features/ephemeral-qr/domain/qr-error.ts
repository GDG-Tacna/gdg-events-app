export type EphemeralQrErrorCode =
  | "checkpoint-not-found"
  | "checkpoint-inactive"
  /** Only talks, entrances and stands have a code that changes on a screen; the catering is scanned by staff. */
  | "not-shown-on-screen"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface EphemeralQrError {
  code: EphemeralQrErrorCode;
}

export const qrError = (code: EphemeralQrErrorCode): EphemeralQrError => ({ code });
