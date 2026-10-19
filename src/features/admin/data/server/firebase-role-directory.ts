import "server-only";
import type { Auth } from "firebase-admin/auth";
import { getAdminAuth } from "@/shared/lib/firebase/admin";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { RoleDirectory } from "../../domain/ports";
import type { Account, ManagedRole } from "../../domain/team";
import { teamError, type TeamError } from "../../domain/team-error";

const isNotFound = (cause: unknown) =>
  typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "auth/user-not-found";

/**
 * Identity adapter (Admin SDK). Role claims are written only here, from trusted server code. After a
 * change the person's refresh tokens are revoked: their session cookie stops verifying, so the new
 * role (or the loss of the old one) takes effect on their next sign-in instead of whenever the
 * cookie happens to expire.
 */
export class FirebaseRoleDirectory implements RoleDirectory {
  constructor(private readonly getAuth: () => Auth = getAdminAuth) {}

  async findByEmail(email: string): Promise<Result<Account | null, TeamError>> {
    try {
      const user = await this.getAuth().getUserByEmail(email);
      const claim: unknown = user.customClaims?.role;
      return ok({ uid: user.uid, email: (user.email ?? email).toLowerCase(), displayName: user.displayName ?? null, claim: typeof claim === "string" ? claim : null });
    } catch (cause) {
      if (isNotFound(cause)) return ok(null);
      logServerError("admin.directory.findByEmail", cause);
      return err(teamError("unknown"));
    }
  }

  async setRole(uid: string, role: ManagedRole | null, options: { keepSession?: boolean } = {}): Promise<Result<void, TeamError>> {
    try {
      const auth = this.getAuth();
      const claims = { ...((await auth.getUser(uid)).customClaims ?? {}) };
      if (role === null) delete claims.role;
      else claims.role = role;

      await auth.setCustomUserClaims(uid, claims);
      if (!options.keepSession) await auth.revokeRefreshTokens(uid);
      return ok(undefined);
    } catch (cause) {
      logServerError("admin.directory.setRole", cause);
      return err(teamError("unknown"));
    }
  }
}
