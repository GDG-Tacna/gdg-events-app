import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { CadetProfiles } from "../../domain/ports";
import { teamError, type TeamError } from "../../domain/team-error";

/**
 * Firestore adapter (Admin SDK): whether an account has a cadet profile in the active edition (`participants/{uid}`).
 * It only asks if the document is there; the cadet feature owns what is in it.
 */
export class FirestoreCadetProfiles implements CadetProfiles {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async hasProfile(uid: string): Promise<Result<boolean, TeamError>> {
    try {
      const snapshot = await eventCollection(this.getDb(), await this.getEventId(), PARTICIPANTS_COLLECTION).doc(uid).get();
      return ok(snapshot.exists);
    } catch (cause) {
      logServerError("admin.profiles.has", cause);
      return err(teamError("unknown"));
    }
  }
}
