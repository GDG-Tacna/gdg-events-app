export type PassErrorCode = "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface PassError {
  code: PassErrorCode;
}

export const passError = (code: PassErrorCode): PassError => ({ code });
