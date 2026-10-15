import "server-only";
import { getAdminAuth } from "@/shared/lib/firebase/admin";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { authError, type AuthError } from "../../domain/auth-error";
import { SESSION_MAX_AGE_MS, type AuthSession } from "../../domain/auth-session";
import type { SessionCookie, SessionService } from "../../domain/ports";
import { isRole } from "../../domain/roles";

/** Firebase recommends minting session cookies only for recently signed-in users. */
const MAX_TOKEN_AGE_SECONDS = 5 * 60;

function errorCode(cause: unknown): string {
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code: unknown }).code)
    : "";
}

/**
 * Expected failures (bad, expired or revoked credentials) map to `invalid-credential`. Anything else
 * (missing Admin credentials, network, permissions) is a server problem: it maps to `unknown` and is
 * logged, so a misconfiguration shows up in the server output instead of failing silently.
 */
function toAuthError(scope: string, cause: unknown): AuthError {
  const code = errorCode(cause);
  if (code.startsWith("auth/") && /token|cookie|argument|revoked|expired/.test(code)) {
    return authError("invalid-credential");
  }
  logServerError(scope, cause);
  return authError("unknown");
}

/** Adapter over the Firebase Admin SDK. Role comes from the `role` custom claim set by trusted server code. */
export class FirebaseSessionService implements SessionService {
  async create(credential: string): Promise<Result<SessionCookie, AuthError>> {
    try {
      const auth = getAdminAuth();
      const decoded = await auth.verifyIdToken(credential, true);
      const ageSeconds = Math.floor(Date.now() / 1000) - decoded.auth_time;
      if (ageSeconds > MAX_TOKEN_AGE_SECONDS) return err(authError("recent-sign-in-required"));

      const value = await auth.createSessionCookie(credential, { expiresIn: SESSION_MAX_AGE_MS });
      return ok({ value, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
    } catch (cause) {
      return err(toAuthError("auth.session.create", cause));
    }
  }

  async refresh(credential: string, currentCookie: string): Promise<Result<SessionCookie, AuthError>> {
    try {
      const auth = getAdminAuth();
      const current = await auth.verifySessionCookie(currentCookie, true);
      const fresh = await auth.verifyIdToken(credential, true);
      if (fresh.uid !== current.uid) return err(authError("invalid-credential"));

      const value = await auth.createSessionCookie(credential, { expiresIn: SESSION_MAX_AGE_MS });
      return ok({ value, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
    } catch (cause) {
      const mapped = toAuthError("auth.session.refresh", cause);
      return err(mapped.code === "invalid-credential" ? authError("unauthenticated") : mapped);
    }
  }

  async verify(cookieValue: string): Promise<Result<AuthSession, AuthError>> {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookieValue, true);
      return ok({
        uid: decoded.uid,
        role: isRole(decoded.role) ? decoded.role : null,
        displayName: typeof decoded.name === "string" ? decoded.name : null,
        photoUrl: typeof decoded.picture === "string" ? decoded.picture : null,
        verifiedEmail: decoded.email_verified === true && typeof decoded.email === "string" ? decoded.email.toLowerCase() : null,
      });
    } catch (cause) {
      const mapped = toAuthError("auth.session.verify", cause);
      return err(mapped.code === "invalid-credential" ? authError("unauthenticated") : mapped);
    }
  }

  async revoke(uid: string): Promise<Result<void, AuthError>> {
    try {
      await getAdminAuth().revokeRefreshTokens(uid);
      return ok(undefined);
    } catch (cause) {
      return err(toAuthError("auth.session.revoke", cause));
    }
  }
}
