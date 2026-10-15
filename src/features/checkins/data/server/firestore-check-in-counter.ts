import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKINS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "../../domain/checkin-error";
import { isCheckpointId, type CheckpointId, type CheckpointKind } from "../../domain/checkpoint";
import type { CheckInCounter } from "../../domain/ports";

/**
 * Counts the check-ins of one checkpoint in the active edition with a Firestore aggregation, which
 * bills one read per 1,000 documents instead of one per document.
 */
export class FirestoreCheckInCounter implements CheckInCounter {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async count(checkpointId: CheckpointId): Promise<Result<number, CheckInError>> {
    if (!isCheckpointId(checkpointId)) return ok(0);
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKINS_COLLECTION)
        .where("checkpointId", "==", checkpointId)
        .count()
        .get();
      return ok(snapshot.data().count);
    } catch (cause) {
      logServerError("checkins.counter.count", cause);
      return err(checkInError("unknown"));
    }
  }

  /** Talks a person has attended in the active edition (their talk check-ins). Food gates ask for it. */
  talksAttended(uid: string): Promise<Result<number, CheckInError>> {
    return this.checkInsOf(uid, "talk");
  }

  /** Which checkpoints of one kind a person checked in to in the active edition (the agenda marks the talks attended). */
  async checkpointIdsOf(uid: string, kind: CheckpointKind): Promise<Result<ReadonlySet<string>, CheckInError>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKINS_COLLECTION).where("uid", "==", uid).where("kind", "==", kind).get();
      return ok(new Set(snapshot.docs.flatMap((doc) => (typeof doc.data().checkpointId === "string" ? [doc.data().checkpointId as string] : []))));
    } catch (cause) {
      logServerError("checkins.counter.checkpointIdsOf", cause);
      return err(checkInError("unknown"));
    }
  }

  /** A person's check-ins of one kind in the active edition (talks attended, stands visited). */
  async checkInsOf(uid: string, kind: CheckpointKind): Promise<Result<number, CheckInError>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKINS_COLLECTION)
        .where("uid", "==", uid)
        .where("kind", "==", kind)
        .count()
        .get();
      return ok(snapshot.data().count);
    } catch (cause) {
      logServerError("checkins.counter.checkInsOf", cause);
      return err(checkInError("unknown"));
    }
  }
}
