export type EphemeralQrErrorCode =
  | "checkpoint-not-found"
  | "checkpoint-inactive"
  /** Only talks use ephemeral codes; catering and entrance use printed ones. */
  | "not-a-talk"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface EphemeralQrError {
  code: EphemeralQrErrorCode;
}

export const qrError = (code: EphemeralQrErrorCode): EphemeralQrError => ({ code });
