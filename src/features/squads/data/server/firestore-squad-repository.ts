import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isSquadId, type SquadId } from "@/shared/types/squad";
import type { AssignOutcome, SquadRepository } from "../../domain/ports";
import { squadError, type SquadError } from "../../domain/squad-error";

/**
 * Firestore adapter (Admin SDK). It writes only the `squad` field of `events/{eventId}/participants/{uid}`: the attendee
 * feature owns every other field of that document.
 */
export class FirestoreSquadRepository implements SquadRepository {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async assignIfUnassigned(uid: string, squad: SquadId): Promise<Result<AssignOutcome, SquadError>> {
    try {
      const db = this.getDb();
      const ref = eventCollection(db, await this.getEventId(), PARTICIPANTS_COLLECTION).doc(uid);

      // Read and write in one transaction so two simultaneous taps cannot assign two squads.
      return await db.runTransaction(async (tx): Promise<Result<AssignOutcome, SquadError>> => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return err(squadError("not-registered"));

        const current: unknown = snapshot.data()?.squad;
        if (isSquadId(current)) return ok({ kind: "already-assigned", squad: current });

        tx.update(ref, { squad });
        return ok({ kind: "assigned", squad });
      });
    } catch (cause) {
      logServerError("squads.assign", cause);
      return err(squadError("unknown"));
    }
  }
}
