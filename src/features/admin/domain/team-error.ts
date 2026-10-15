export type TeamErrorCode =
  | "invalid-email"
  /** Nobody has signed in with that email yet: roles attach to an account that exists. */
  | "user-not-found"
  /** Admins cannot change their own role: ask another admin. */
  | "cannot-change-self"
  /** The change would leave the app without any admin. */
  | "last-admin"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface TeamError {
  code: TeamErrorCode;
}

export const teamError = (code: TeamErrorCode): TeamError => ({ code });
