import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKINS_COLLECTION, PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInId } from "../../domain/check-in";
import { checkInError, type CheckInError } from "../../domain/checkin-error";
import type { Checkpoint } from "../../domain/checkpoint";
import type { CheckInRepository, RecordOutcome } from "../../domain/ports";

/**
 * Firestore adapter (Admin SDK). The deterministic document id is the idempotency key, and the
 * existence check and the write share one transaction so two simultaneous scans store one record.
 * It also owns one field of the attendee document, `attendedAt`, stamped by the first entrance check-in.
 */
export class FirestoreCheckInRepository implements CheckInRepository {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async record(input: { uid: string; checkpoint: Checkpoint; at: Date }): Promise<Result<RecordOutcome, CheckInError>> {
    const { uid, checkpoint, at } = input;
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const userRef = eventCollection(db, eventId, PARTICIPANTS_COLLECTION).doc(uid);
      const checkInRef = eventCollection(db, eventId, CHECKINS_COLLECTION).doc(checkInId(uid, checkpoint.id));

      return await db.runTransaction(async (tx): Promise<Result<RecordOutcome, CheckInError>> => {
        const [user, existing] = await Promise.all([tx.get(userRef), tx.get(checkInRef)]);
        if (!user.exists) return err(checkInError("not-registered"));
        if (existing.exists) return ok({ kind: "already-recorded" });

        tx.create(checkInRef, { uid, checkpointId: checkpoint.id, kind: checkpoint.kind, at });

        const firstEntrance = checkpoint.kind === "entrance" && user.data()?.attendedAt === undefined;
        if (firstEntrance) tx.update(userRef, { attendedAt: at });
        return ok({ kind: "recorded", firstEntrance });
      });
    } catch (cause) {
      logServerError("checkins.record", cause);
      return err(checkInError("unknown"));
    }
  }
}
