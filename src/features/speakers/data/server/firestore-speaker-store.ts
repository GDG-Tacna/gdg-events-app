import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { SPEAKERS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { SpeakerPatch, SpeakerStore } from "../../domain/manage";
import { isSpeakerId, type Speaker } from "../../domain/speaker";

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const link = (value: unknown): string | null => (typeof value === "string" && value.startsWith("https://") ? value : null);

/** A stored speaker, or `null` when it cannot be shown (no name). The photo's address is rebuilt from its path. */
export function toSpeaker(id: string, data: Record<string, unknown> | undefined): Speaker | null {
  if (!isSpeakerId(id) || !data || typeof data.name !== "string" || data.name.trim() === "") return null;
  const links = (data.links ?? {}) as Record<string, unknown>;
  return {
    id,
    name: data.name,
    headline: text(data.headline),
    bio: text(data.bio),
    photo: typeof data.photoPath === "string" ? imageRefOf(data.photoPath, "speaker") : null,
    links: { linkedin: link(links.linkedin), github: link(links.github), web: link(links.web) },
    active: data.active !== false,
  };
}

/** The stored fields: the photo by its path only (its address is the app's to build). */
function toFields(patch: SpeakerPatch): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.headline !== undefined) fields.headline = patch.headline;
  if (patch.bio !== undefined) fields.bio = patch.bio;
  if (patch.links !== undefined) fields.links = { ...patch.links };
  if (patch.photo !== undefined) fields.photoPath = patch.photo?.path ?? null;
  if (patch.active !== undefined) fields.active = patch.active;
  return fields;
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/** Firestore adapter (Admin SDK) over `events/{eventId}/speakers`. `create` never overwrites; updates are transactions. */
export class FirestoreSpeakerStore implements SpeakerStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    const db = this.getDb();
    return { db, collection: eventCollection(db, await this.getEventId(), SPEAKERS_COLLECTION) };
  }

  async list(): Promise<Result<readonly Speaker[], { code: string }>> {
    try {
      const { collection } = await this.collection();
      const snapshot = await collection.get();
      return ok(snapshot.docs.flatMap((doc) => toSpeaker(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("speakers.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(speaker: Speaker): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const { collection } = await this.collection();
      const { id, ...rest } = speaker;
      await collection.doc(id).create({ ...toFields(rest), createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("speakers.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: SpeakerPatch): Promise<Result<{ before: Speaker; after: Speaker } | null, { code: string }>> {
    try {
      const { db, collection } = await this.collection();
      const ref = collection.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toSpeaker(id, snapshot.data()) : null;
        if (!before) return ok(null);
        const fields = toFields(patch);
        tx.update(ref, { ...fields, updatedAt: new Date() });
        return ok({ before, after: { ...before, ...patch } as Speaker });
      });
    } catch (cause) {
      logServerError("speakers.store.update", cause);
      return err({ code: "unknown" });
    }
  }
}
