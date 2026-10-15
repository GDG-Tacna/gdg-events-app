import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKPOINTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isCheckpointId, isCheckpointKind } from "@/features/checkins";
import { NO_FOOD_REQUIREMENTS, parseFoodRequirements, type FoodRequirements } from "../../domain/food-gate";
import type { CheckpointStore, ManagedCheckpoint } from "../../domain/manage";

const nameOf = (id: string, name: unknown): string => (typeof name === "string" && name.trim() !== "" ? name.trim() : id);

/** Reads a document into a checkpoint, or `null` when it is malformed: a checkpoint nobody can describe is not shown or changed. */
function toCheckpoint(id: string, data: Record<string, unknown> | undefined): ManagedCheckpoint | null {
  if (!isCheckpointId(id) || !data || !isCheckpointKind(data.kind)) return null;
  return {
    id,
    kind: data.kind,
    name: nameOf(id, data.name),
    active: data.active === true,
    requirements: data.kind === "catering" ? parseFoodRequirements(data.requirements) : NO_FOOD_REQUIREMENTS,
  };
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/checkpoints`. The id is the document id, so two
 * admins creating the same id cannot both succeed (`create` fails if the document exists); renaming and
 * opening or closing are single-document transactions that report what the checkpoint was before.
 */
export class FirestoreCheckpointStore implements CheckpointStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async list(): Promise<Result<readonly ManagedCheckpoint[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKPOINTS_COLLECTION).get();

      const checkpoints: ManagedCheckpoint[] = [];
      for (const doc of snapshot.docs) {
        const checkpoint = toCheckpoint(doc.id, doc.data());
        if (checkpoint) checkpoints.push(checkpoint);
      }
      checkpoints.sort((a, b) => a.name.localeCompare(b.name));
      return ok(checkpoints);
    } catch (cause) {
      logServerError("checkpoints.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(checkpoint: ManagedCheckpoint): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, CHECKPOINTS_COLLECTION)
        .doc(checkpoint.id)
        .create({ kind: checkpoint.kind, name: checkpoint.name, active: checkpoint.active, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("checkpoints.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(
    id: string,
    patch: { name?: string; active?: boolean; requirements?: FoodRequirements },
  ): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, CHECKPOINTS_COLLECTION).doc(id);

      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toCheckpoint(id, snapshot.data()) : null;
        if (!before) return ok(null);

        const after: ManagedCheckpoint = { ...before, ...patch };
        tx.update(ref, {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          ...(patch.requirements !== undefined ? { requirements: patch.requirements } : {}),
        });
        return ok({ before, after });
      });
    } catch (cause) {
      logServerError("checkpoints.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  /** The food gate of a checkpoint for the serve gate: none when it has none, is not a meal or does not exist. */
  async requirementsOf(id: string): Promise<Result<FoodRequirements, { code: string }>> {
    if (!isCheckpointId(id)) return ok(NO_FOOD_REQUIREMENTS);
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, CHECKPOINTS_COLLECTION).doc(id).get();
      const checkpoint = snapshot.exists ? toCheckpoint(id, snapshot.data()) : null;
      return ok(checkpoint ? checkpoint.requirements : NO_FOOD_REQUIREMENTS);
    } catch (cause) {
      logServerError("checkpoints.store.requirements", cause);
      return err({ code: "unknown" });
    }
  }
}
