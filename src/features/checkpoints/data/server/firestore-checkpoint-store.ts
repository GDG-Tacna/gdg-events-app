import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKINS_COLLECTION, CHECKPOINTS_COLLECTION, MISSIONS_COLLECTION, STAFF_SCOPES_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isCheckpointId, isCheckpointKind } from "@/features/checkins";
import { imageRefOf } from "@/features/media/server";
import { NO_FOOD_REQUIREMENTS, parseFoodRequirements, type FoodRequirements } from "../../domain/food-gate";
import type { CheckpointDeletion, CheckpointInUse, CheckpointPatch, CheckpointStore, ManagedCheckpoint } from "../../domain/manage";

const nameOf = (id: string, name: unknown): string => (typeof name === "string" && name.trim() !== "" ? name.trim() : id);

/** Reads a document into a checkpoint, or `null` when it is malformed: a checkpoint nobody can describe is not shown or changed. */
export function toCheckpoint(id: string, data: Record<string, unknown> | undefined): ManagedCheckpoint | null {
  if (!isCheckpointId(id) || !data || !isCheckpointKind(data.kind)) return null;
  return {
    id,
    kind: data.kind,
    name: nameOf(id, data.name),
    active: data.active === true,
    description: typeof data.description === "string" ? data.description : "",
    image: typeof data.imagePath === "string" ? imageRefOf(data.imagePath, "checkpoint") : null,
    requirements: data.kind === "catering" ? parseFoodRequirements(data.requirements) : NO_FOOD_REQUIREMENTS,
  };
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/** The checkpoint once the patch is applied (what the screens will read back). */
function patched(before: ManagedCheckpoint, patch: CheckpointPatch): ManagedCheckpoint {
  const kind = patch.kind ?? before.kind;
  return {
    ...before,
    kind,
    name: patch.name ?? before.name,
    active: patch.active ?? before.active,
    description: patch.description ?? before.description,
    image: patch.image !== undefined ? patch.image : before.image,
    requirements: kind !== "catering" || patch.requirements === null ? NO_FOOD_REQUIREMENTS : (patch.requirements ?? before.requirements),
  };
}

/** The stored fields a patch changes. A cleared food gate or image is removed from the document. */
function fieldsOf(patch: CheckpointPatch): Record<string, unknown> {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.image !== undefined ? { imagePath: patch.image === null ? FieldValue.delete() : patch.image.path } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.requirements !== undefined ? { requirements: patch.requirements === null ? FieldValue.delete() : (patch.requirements satisfies FoodRequirements) } : {}),
  };
}

/** Every stored field of a checkpoint that moves to a new id (createdAt included), with the patch on top; a cleared field is left out. */
function movedFields(data: Record<string, unknown>, patch: CheckpointPatch): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...data };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.active !== undefined) fields.active = patch.active;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.kind !== undefined) fields.kind = patch.kind;
  if (patch.image === null) delete fields.imagePath;
  else if (patch.image !== undefined) fields.imagePath = patch.image.path;
  if (patch.requirements === null) delete fields.requirements;
  else if (patch.requirements !== undefined) fields.requirements = patch.requirements;
  return fields;
}

/** The ids of a staff scope, keeping only strings. */
const scopeIdsOf = (data: Record<string, unknown> | undefined): string[] =>
  Array.isArray(data?.checkpointIds) ? data.checkpointIds.filter((id): id is string => typeof id === "string") : [];

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/checkpoints`. The id is the document id, so two
 * admins creating the same id cannot both succeed (`create` fails if the document exists); every change is a
 * transaction that reports what the checkpoint was before. A change of kind or id reads the check-ins and missions
 * that refer to the checkpoint inside the same transaction, as deleting does, so a scan at the same moment retries it.
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
        .create({
          kind: checkpoint.kind,
          name: checkpoint.name,
          active: checkpoint.active,
          ...(checkpoint.description !== "" ? { description: checkpoint.description } : {}),
          ...(checkpoint.image ? { imagePath: checkpoint.image.path } : {}),
          createdAt: new Date(),
        });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("checkpoints.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  /** Whether a check-in or a mission refers to the checkpoint, read inside the transaction. */
  private async inUse(tx: Transaction, eventId: string, id: string): Promise<CheckpointInUse | null> {
    const db = this.getDb();
    const checkIns = eventCollection(db, eventId, CHECKINS_COLLECTION).where("checkpointId", "==", id).limit(1);
    const missions = eventCollection(db, eventId, MISSIONS_COLLECTION).where("config.checkpointId", "==", id).limit(1);
    const [scanned, tied] = await Promise.all([tx.get(checkIns), tx.get(missions)]);
    if (!scanned.empty) return "has-check-ins";
    if (!tied.empty) return "has-missions";
    return null;
  }

  /** The staff scopes that list the checkpoint, read inside the transaction (to rewrite them after its reads). */
  private async scopesWith(tx: Transaction, eventId: string, id: string): Promise<{ ref: DocumentReference; ids: string[] }[]> {
    const scopes = await tx.get(eventCollection(this.getDb(), eventId, STAFF_SCOPES_COLLECTION).where("checkpointIds", "array-contains", id));
    return scopes.docs.map((doc) => ({ ref: doc.ref, ids: scopeIdsOf(doc.data()) }));
  }

  async delete(id: string): Promise<Result<CheckpointDeletion, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, CHECKPOINTS_COLLECTION).doc(id);

      // Reading the check-ins and missions inside the transaction makes a scan or a new mission at the same moment retry the delete.
      return await db.runTransaction(async (tx): Promise<Result<CheckpointDeletion, { code: string }>> => {
        const [snapshot, used, scopes] = await Promise.all([tx.get(ref), this.inUse(tx, eventId, id), this.scopesWith(tx, eventId, id)]);
        const checkpoint = snapshot.exists ? toCheckpoint(id, snapshot.data()) : null;
        if (!checkpoint) return ok({ kind: "not-found" });
        if (used) return ok({ kind: used });
        tx.delete(ref);
        // Staff limited to it keep the rest of their stations.
        for (const scope of scopes) tx.update(scope.ref, { checkpointIds: scope.ids.filter((scoped) => scoped !== id) });
        return ok({ kind: "deleted", checkpoint });
      });
    } catch (cause) {
      logServerError("checkpoints.store.delete", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: CheckpointPatch): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "unknown" }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, CHECKPOINTS_COLLECTION).doc(id);

      return await db.runTransaction(async (tx): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "unknown" }>> => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toCheckpoint(id, snapshot.data()) : null;
        if (!before) return ok(null);
        // A new kind changes how scans and missions read the checkpoint: only while nothing refers to it.
        if (patch.kind !== undefined && patch.kind !== before.kind) {
          const used = await this.inUse(tx, eventId, id);
          if (used) return err({ code: used });
        }

        tx.update(ref, fieldsOf(patch));
        return ok({ before, after: patched(before, patch) });
      });
    } catch (cause) {
      logServerError("checkpoints.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async rekey(
    oldId: string,
    newId: string,
    patch: CheckpointPatch,
  ): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "already-exists" | "unknown" }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const checkpoints = eventCollection(db, eventId, CHECKPOINTS_COLLECTION);
      const oldRef = checkpoints.doc(oldId);
      const newRef = checkpoints.doc(newId);

      type Rekeyed = Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "already-exists" | "unknown" }>;
      return await db.runTransaction(async (tx): Promise<Rekeyed> => {
        const [snapshot, taken, used, scopes] = await Promise.all([tx.get(oldRef), tx.get(newRef), this.inUse(tx, eventId, oldId), this.scopesWith(tx, eventId, oldId)]);
        const before = snapshot.exists ? toCheckpoint(oldId, snapshot.data()) : null;
        if (!before) return ok(null);
        if (used) return err({ code: used });
        if (taken.exists) return err({ code: "already-exists" });

        tx.create(newRef, movedFields(snapshot.data() ?? {}, patch));
        tx.delete(oldRef);
        for (const scope of scopes) tx.update(scope.ref, { checkpointIds: scope.ids.map((scoped) => (scoped === oldId ? newId : scoped)) });
        return ok({ before, after: { ...patched(before, patch), id: newId } });
      });
    } catch (cause) {
      logServerError("checkpoints.store.rekey", cause);
      return err({ code: "unknown" });
    }
  }

  async usage(ids: readonly string[]): Promise<Result<Readonly<Record<string, { checkIns: boolean; missions: boolean }>>, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const checkIns = eventCollection(db, eventId, CHECKINS_COLLECTION);
      const missions = eventCollection(db, eventId, MISSIONS_COLLECTION);
      // One tiny query per kind and puesto (an edition has a handful of them): enough to know whether anything refers to it.
      const entries = await Promise.all(
        ids.map(async (id) => {
          const [scanned, tied] = await Promise.all([checkIns.where("checkpointId", "==", id).limit(1).get(), missions.where("config.checkpointId", "==", id).limit(1).get()]);
          return [id, { checkIns: !scanned.empty, missions: !tied.empty }] as const;
        }),
      );
      return ok(Object.fromEntries(entries));
    } catch (cause) {
      logServerError("checkpoints.store.usage", cause);
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
