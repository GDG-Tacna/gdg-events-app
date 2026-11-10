import "server-only";
import type { Auth } from "firebase-admin/auth";
import { getAdminAuth } from "@/shared/lib/firebase/admin";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AccountDirectory, CadetAccount } from "../../domain/manage";

const isNotFound = (cause: unknown) => typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "auth/user-not-found";

/**
 * The sign-in accounts through Firebase Auth (Admin SDK). Disabling an account stops it from signing in to the app
 * (any edition) and, with its refresh tokens revoked, ends the sessions it has: session cookies are verified with the
 * revocation check, so the next request of a signed-in cadet is refused.
 */
export class FirebaseAccountDirectory implements AccountDirectory {
  constructor(private readonly getAuth: () => Auth = getAdminAuth) {}

  async lookup(uid: string): Promise<Result<CadetAccount | null, { code: string }>> {
    try {
      const user = await this.getAuth().getUser(uid);
      const role = user.customClaims?.role;
      return ok({ email: user.email ?? null, displayName: user.displayName ?? null, role: typeof role === "string" ? role : null, disabled: user.disabled });
    } catch (cause) {
      if (isNotFound(cause)) return ok(null);
      logServerError("cadets.accounts.lookup", cause);
      return err({ code: "unknown" });
    }
  }

  async setDisabled(uid: string, disabled: boolean): Promise<Result<void, { code: string }>> {
    try {
      const auth = this.getAuth();
      await auth.updateUser(uid, { disabled });
      if (disabled) await auth.revokeRefreshTokens(uid);
      return ok(undefined);
    } catch (cause) {
      logServerError("cadets.accounts.setDisabled", cause);
      return err({ code: "unknown" });
    }
  }
}
