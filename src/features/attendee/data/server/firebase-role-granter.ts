import "server-only";
import type { Auth } from "firebase-admin/auth";
import { isRole } from "@/features/auth/server";
import { getAdminAuth } from "@/shared/lib/firebase/admin";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { attendeeError, type AttendeeError } from "../../domain/attendee-error";
import type { RoleGranter } from "../../domain/ports";

/** Sets the `role` custom claim. Claims are only ever written from trusted server code. */
export class FirebaseRoleGranter implements RoleGranter {
  constructor(private readonly getAuth: () => Auth = getAdminAuth) {}

  async grantAttendeeRole(uid: string): Promise<Result<void, AttendeeError>> {
    try {
      const auth = this.getAuth();
      const claims = (await auth.getUser(uid)).customClaims ?? {};

      // Idempotent, and never downgrades an admin. A staff or organizer claim is replaced: registering is only reached
      // when the guard found that person outside the active edition's team (those roles are per edition).
      if (isRole(claims.role) && claims.role !== "staff" && claims.role !== "organizer") return ok(undefined);

      await auth.setCustomUserClaims(uid, { ...claims, role: "attendee" });
      return ok(undefined);
    } catch (cause) {
      logServerError("attendee.grantRole", cause);
      return err(attendeeError("unknown"));
    }
  }
}
