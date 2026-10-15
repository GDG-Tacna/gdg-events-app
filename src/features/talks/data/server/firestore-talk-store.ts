import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isCheckpointId } from "@/features/checkins";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CHECKPOINTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { TalkPatch, TalkStore } from "../../domain/manage";
import type { Talk } from "../../domain/talk";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/**
 * A stored checkpoint of kind `talk` as a talk, or `null` when it is not one. Talks made in Puestos before this
 * module have only a name: their speaker, times and room read as missing.
 */
export function toTalk(id: string, data: Record<string, unknown> | undefined): Talk | null {
  if (!isCheckpointId(id) || !data || data.kind !== "talk") return null;
  return {
    id,
    title: text(data.name) ?? id,
    speaker: text(data.speaker),
    startsAt: toDate(data.startsAt),
    endsAt: toDate(data.endsAt),
    roomId: text(data.roomId),
    description: typeof data.description === "string" ? data.description : "",
    active: data.active === true,
  };
}

/** The stored fields of a talk: the checkpoint's own (`name`, `kind`, `active`) and the talk's. */
function toFields(patch: TalkPatch): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.name = patch.title;
  if (patch.speaker !== undefined) fields.speaker = patch.speaker;
  if (patch.startsAt !== undefined) fields.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) fields.endsAt = patch.endsAt;
  if (patch.roomId !== undefined) fields.roomId = patch.roomId;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.active !== undefined) fields.active = patch.active;
  return fields;
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over the talks among `events/{eventId}/checkpoints` (kind `talk`). A talk is a
 * checkpoint, so its id can never clash with a station's (`create` fails if the document exists), and the check-in
 * catalog, talk missions and the projected QR read it as before.
 */
export class FirestoreTalkStore implements TalkStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    const db = this.getDb();
    return { db, collection: eventCollection(db, await this.getEventId(), CHECKPOINTS_COLLECTION) };
  }

  async list(): Promise<Result<readonly Talk[], { code: string }>> {
    try {
      const { collection } = await this.collection();
      const snapshot = await collection.where("kind", "==", "talk").get();
      return ok(snapshot.docs.flatMap((doc) => toTalk(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("talks.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(talk: Talk): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const { collection } = await this.collection();
      await collection.doc(talk.id).create({ kind: "talk", ...toFields(talk), createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("talks.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: TalkPatch): Promise<Result<{ before: Talk; after: Talk } | null, { code: string }>> {
    if (!isCheckpointId(id)) return ok(null);
    try {
      const { db, collection } = await this.collection();
      const ref = collection.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toTalk(id, snapshot.data()) : null;
        if (!before) return ok(null);
        tx.update(ref, toFields(patch));
        return ok({ before, after: { ...before, ...patch } });
      });
    } catch (cause) {
      logServerError("talks.store.update", cause);
      return err({ code: "unknown" });
    }
  }
}
