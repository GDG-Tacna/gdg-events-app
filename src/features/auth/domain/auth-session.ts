import type { Role } from "./roles";

/**
 * Identity resolved from a verified session cookie.
 * `role` is null until the attendee completes onboarding (the claim is set by the server).
 */
export interface AuthSession {
  uid: string;
  role: Role | null;
  /**
   * For an admin session: "global" for an admin of the whole app, "edition" for an organizer of the active edition
   * (it may manage the edition but not name admins or organizers). Set by the app's guard.
   */
  adminScope?: "global" | "edition";
  displayName: string | null;
  photoUrl: string | null;
  /** The account's email when the provider verified it (Google does), lowercased; matched against invitations. */
  verifiedEmail?: string | null;
}

/** Session cookie lifetime; Firebase allows between 5 minutes and 14 days. */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
