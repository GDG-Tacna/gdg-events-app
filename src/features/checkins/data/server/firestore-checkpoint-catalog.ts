import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKPOINTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "../../domain/checkin-error";
import { isCheckpointId, isCheckpointKind, type Checkpoint, type CheckpointId } from "../../domain/checkpoint";
import type { CheckpointCatalog } from "../../domain/ports";

const nameOf = (id: string, name: unknown): string => (typeof name === "string" && name.trim() !== "" ? name.trim() : id);

/**
 * Reads `events/{eventId}/checkpoints/{id}` (Admin SDK). A malformed document is treated as missing instead of
 * guessing: a checkpoint nobody can describe cannot accept scans.
 */
export class FirestoreCheckpointCatalog implements CheckpointCatalog {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async find(id: CheckpointId): Promise<Result<Checkpoint | null, CheckInError>> {
    if (!isCheckpointId(id)) return ok(null);
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKPOINTS_COLLECTION).doc(id).get();
      if (!snapshot.exists) return ok(null);

      const data = snapshot.data();
      if (!isCheckpointKind(data?.kind)) return ok(null);
      return ok({ id, kind: data.kind, name: nameOf(id, data.name), active: data.active === true });
    } catch (cause) {
      logServerError("checkins.catalog.find", cause);
      return err(checkInError("unknown"));
    }
  }

  async listActive(): Promise<Result<readonly Checkpoint[], CheckInError>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKPOINTS_COLLECTION)
        .where("active", "==", true)
        .get();

      const checkpoints: Checkpoint[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        // A malformed document is skipped rather than guessed at.
        if (!isCheckpointId(doc.id) || !isCheckpointKind(data.kind)) continue;
        checkpoints.push({ id: doc.id, kind: data.kind, name: nameOf(doc.id, data.name), active: true });
      }
      checkpoints.sort((a, b) => a.name.localeCompare(b.name));
      return ok(checkpoints);
    } catch (cause) {
      logServerError("checkins.catalog.listActive", cause);
      return err(checkInError("unknown"));
    }
  }
}
