import type { Result } from "@/shared/lib/result";
import type { AuthError } from "./auth-error";
import type { AuthSession } from "./auth-session";

/**
 * Result of starting a sign-in. Popup-based providers resolve to a credential right away;
 * redirect-based providers send the browser away and finish in `resumeSignIn()`.
 * The credential is opaque to the domain: only the matching `SessionService` understands it.
 */
export type SignInStart =
  | { kind: "credential"; credential: string }
  | { kind: "redirecting" };

/** Client-side identity provider (Google sign-in). */
export interface IdentityProvider {
  signInWithGoogle(): Promise<Result<SignInStart, AuthError>>;
  /** Completes a redirect-based sign-in after the browser comes back; null when nothing is pending. */
  resumeSignIn(): Promise<Result<string | null, AuthError>>;
  /** Forces a new credential for the signed-in user so server-side changes (such as a role) are picked up. */
  refreshCredential(): Promise<Result<string, AuthError>>;
  signOut(): Promise<void>;
}

/** Client → server channel that opens or closes the session cookie. */
export interface SessionGateway {
  open(credential: string): Promise<Result<void, AuthError>>;
  /** Replaces the session cookie with a fresh one that reflects the user's current role. */
  refresh(credential: string): Promise<Result<void, AuthError>>;
  close(): Promise<Result<void, AuthError>>;
}

export interface SessionCookie {
  value: string;
  expiresAt: Date;
}

/** Server-side session management (verifies credentials and cookies). */
export interface SessionService {
  create(credential: string): Promise<Result<SessionCookie, AuthError>>;
  /**
   * Re-mints the cookie for a user who already has a valid one. Needs both proofs (current cookie and
   * a fresh credential of the same user) and skips the "recent sign-in" rule that `create` enforces.
   */
  refresh(credential: string, currentCookie: string): Promise<Result<SessionCookie, AuthError>>;
  verify(cookieValue: string): Promise<Result<AuthSession, AuthError>>;
  revoke(uid: string): Promise<Result<void, AuthError>>;
}
