import "server-only";
import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { EDITION } from "@/shared/config/edition";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { APP_CONFIG_DOC, CONFIG_COLLECTION, EVENTS_COLLECTION, eventDocument } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isEventId } from "@/shared/types/event";
import type { Edition, EditionCatalog, EditionPatch } from "../../domain/editions";
import type { EventInfo, EventStore } from "../../domain/event";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/** A stored date, or `null` when it is missing or not a date. */
function dateOf(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate(): Date }).toDate();
  }
  return null;
}

const textOf = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : null);

/** An edition document, tolerant of the fields older editions never had (only `endsAt`, or nothing at all). */
function toEdition(id: string, data: DocumentData | undefined): Edition {
  return {
    id,
    name: textOf(data?.name),
    venue: textOf(data?.venue),
    startsAt: dateOf(data?.startsAt),
    endsAt: dateOf(data?.endsAt),
    status: data?.status === "finished" ? "finished" : "draft",
  };
}

/** Firestore adapter (Admin SDK) over the document of the public edition, `events/{eventId}`. */
export class FirestoreEventStore implements EventStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async get(): Promise<Result<EventInfo, { code: string }>> {
    try {
      const id = await this.getEventId();
      const snapshot = await eventDocument(this.getDb(), id).get();
      const edition = toEdition(id, snapshot.data());
      return ok({ id, endsAt: edition.endsAt, status: edition.status });
    } catch (cause) {
      logServerError("event.store.get", cause);
      return err({ code: "unknown" });
    }
  }
}

/**
 * Firestore adapter (Admin SDK) over every edition, `events/{eventId}`, and which one is public,
 * `config/app.activeEventId`. Editions are found with `listDocuments`, so one that only has data under it
 * (made before editions had a document) is listed too. Publishing is a transaction on `config/app`.
 */
export class FirestoreEditionCatalog implements EditionCatalog {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  async list(): Promise<Result<readonly Edition[], { code: string }>> {
    try {
      const db = this.getDb();
      const refs = (await db.collection(EVENTS_COLLECTION).listDocuments()).filter((ref) => isEventId(ref.id));
      if (refs.length === 0) return ok([]);
      const snapshots = await db.getAll(...refs);
      return ok(snapshots.map((snapshot) => toEdition(snapshot.id, snapshot.data())));
    } catch (cause) {
      logServerError("event.catalog.list", cause);
      return err({ code: "unknown" });
    }
  }

  async publicId(): Promise<Result<string, { code: string }>> {
    try {
      const snapshot = await this.getDb().collection(CONFIG_COLLECTION).doc(APP_CONFIG_DOC).get();
      const configured: unknown = snapshot.data()?.activeEventId;
      if (configured === undefined) return ok(EDITION.defaultEventId);
      if (!isEventId(configured)) throw new Error("config/app.activeEventId is not a valid event id");
      return ok(configured);
    } catch (cause) {
      logServerError("event.catalog.publicId", cause);
      return err({ code: "unknown" });
    }
  }

  async create(edition: Edition): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const { id, ...data } = edition;
      await eventDocument(this.getDb(), id).create({ ...data, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("event.catalog.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: EditionPatch): Promise<Result<{ before: Edition; after: Edition }, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = eventDocument(db, id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = toEdition(id, snapshot.data());
        const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        // `merge` keeps whatever else the document holds, and creates it for an edition that only had data under it.
        tx.set(ref, { ...fields, updatedAt: new Date() }, { merge: true });
        return ok({ before, after: { ...before, ...fields } as Edition });
      });
    } catch (cause) {
      logServerError("event.catalog.update", cause);
      return err({ code: "unknown" });
    }
  }

  async publish(id: string): Promise<Result<{ previous: string }, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(CONFIG_COLLECTION).doc(APP_CONFIG_DOC);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const current: unknown = snapshot.data()?.activeEventId;
        tx.set(ref, { activeEventId: id, updatedAt: new Date() }, { merge: true });
        return ok({ previous: isEventId(current) ? current : EDITION.defaultEventId });
      });
    } catch (cause) {
      logServerError("event.catalog.publish", cause);
      return err({ code: "unknown" });
    }
  }
}
