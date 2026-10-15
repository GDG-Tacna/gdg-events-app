import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { COMMUNICATIONS_COLLECTION, EVENT_CONFIG_COLLECTION, STORY_DOC, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseCommunication, type Communication } from "../../domain/communication";
import type { CommunicationPatch, CommunicationStore } from "../../domain/manage";
import type { CommunicationSource } from "../../domain/odyssey";
import { parseStoryTitle, type StoryTitleSource, type StoryTitleStore } from "../../domain/story";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/communications` and the story's title in
 * `events/{eventId}/config/story`. A document that cannot be shown is logged and skipped; `create` never
 * overwrites; updates are single-document transactions; the order is saved in one batch.
 */
export class FirestoreCommunicationStore implements CommunicationSource, CommunicationStore, StoryTitleStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async list(): Promise<Result<readonly Communication[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, COMMUNICATIONS_COLLECTION).get();
      const communications: Communication[] = [];
      for (const doc of snapshot.docs) {
        const communication = parseCommunication(doc.id, doc.data());
        if (communication) communications.push(communication);
        else logServerError("odyssey.store.parse", new Error(`communication ${doc.id} of ${eventId} cannot be shown`));
      }
      return ok(communications);
    } catch (cause) {
      logServerError("odyssey.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(communication: Communication): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      const { id, ...data } = communication;
      await eventCollection(this.getDb(), eventId, COMMUNICATIONS_COLLECTION).doc(id).create({ ...data, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("odyssey.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: CommunicationPatch): Promise<Result<{ before: Communication; after: Communication } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, COMMUNICATIONS_COLLECTION).doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? parseCommunication(id, snapshot.data()) : null;
        if (!before) return ok(null);
        const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        tx.update(ref, fields);
        return ok({ before, after: { ...before, ...fields } as Communication });
      });
    } catch (cause) {
      logServerError("odyssey.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const collection = eventCollection(db, eventId, COMMUNICATIONS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("odyssey.store.setOrder", cause);
      return err({ code: "unknown" });
    }
  }

  async readTitle(): Promise<Result<string | null, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION).doc(STORY_DOC).get();
      return ok(snapshot.exists ? parseStoryTitle(snapshot.data()) : null);
    } catch (cause) {
      logServerError("odyssey.story.read", cause);
      return err({ code: "unknown" });
    }
  }

  async saveTitle(title: string | null): Promise<Result<void, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION).doc(STORY_DOC).set({ title, updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("odyssey.story.save", cause);
      return err({ code: "unknown" });
    }
  }
}

/** The story's title kept in memory for a short time, like the communications. Failed reads are never cached. */
export class CachedStoryTitle implements StoryTitleSource {
  private cached: { title: string | null; expiresAt: number } | null = null;

  constructor(
    private readonly source: StoryTitleSource,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async readTitle(): Promise<Result<string | null, { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.title);
    const read = await this.source.readTitle();
    if (read.ok) this.cached = { title: read.value, expiresAt: this.now() + this.ttlMs };
    return read;
  }

  invalidate(): void {
    this.cached = null;
  }
}

/** The communications kept in memory for a short time. Failed reads are never cached; admin changes call `invalidate()`. */
export class CachedCommunicationSource implements CommunicationSource {
  private cached: { communications: readonly Communication[]; expiresAt: number } | null = null;

  constructor(
    private readonly source: CommunicationSource,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<Result<readonly Communication[], { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.communications);
    const listed = await this.source.list();
    if (listed.ok) this.cached = { communications: listed.value, expiresAt: this.now() + this.ttlMs };
    return listed;
  }

  invalidate(): void {
    this.cached = null;
  }
}
