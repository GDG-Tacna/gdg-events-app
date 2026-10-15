export type AuthErrorCode =
  | "cancelled"
  | "network"
  | "invalid-credential"
  | "recent-sign-in-required"
  | "unauthenticated"
  | "forbidden"
  | "unknown";

export interface AuthError {
  code: AuthErrorCode;
}

export const authError = (code: AuthErrorCode): AuthError => ({ code });
