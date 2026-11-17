export type EphemeralQrErrorCode =
  | "checkpoint-not-found"
  | "checkpoint-inactive"
  /** Only talks and entrances have a code that changes on a screen; catering and stands are scanned by staff. */
  | "not-shown-on-screen"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface EphemeralQrError {
  code: EphemeralQrErrorCode;
}

export const qrError = (code: EphemeralQrErrorCode): EphemeralQrError => ({ code });
