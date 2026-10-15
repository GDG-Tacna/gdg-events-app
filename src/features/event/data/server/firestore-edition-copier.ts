import "server-only";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  ACHIEVEMENTS_COLLECTION,
  CHECKPOINTS_COLLECTION,
  COMMUNICATIONS_COLLECTION,
  ECONOMY_DOC,
  EVENT_CONFIG_COLLECTION,
  MISSIONS_COLLECTION,
  QUADRANTS_COLLECTION,
  RANKS_DOC,
  SQUAD_PRIZES_COLLECTION,
  SQUADS_COLLECTION,
  STORY_DOC,
  VENUE_COLLECTION,
  VENUE_MAP_DOC,
  eventCollection,
  eventDocument,
  type EventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { CopyPart, EditionCopier, EditionDocument } from "../../domain/copy";

/** Where each part lives in an edition: whole collections (optionally only some documents) and single documents. */
interface PartSource {
  collections: ReadonlyArray<{ name: EventCollection; keep?: (data: DocumentData) => boolean }>;
  documents: ReadonlyArray<{ collection: EventCollection; id: string }>;
}

const isTalk = (data: DocumentData) => data.kind === "talk";
const MINIGAMES_DOC = "minigames";

/** The storage of each part (talks share the checkpoints collection, told apart by their kind). */
export const PART_SOURCES: Readonly<Record<CopyPart, PartSource>> = {
  squads: { collections: [{ name: SQUADS_COLLECTION }], documents: [] },
  map: { collections: [{ name: QUADRANTS_COLLECTION }], documents: [{ collection: VENUE_COLLECTION, id: VENUE_MAP_DOC }] },
  checkpoints: { collections: [{ name: CHECKPOINTS_COLLECTION, keep: (data) => !isTalk(data) }], documents: [] },
  talks: { collections: [{ name: CHECKPOINTS_COLLECTION, keep: isTalk }], documents: [] },
  missions: { collections: [{ name: MISSIONS_COLLECTION }], documents: [] },
  story: { collections: [{ name: COMMUNICATIONS_COLLECTION }], documents: [{ collection: EVENT_CONFIG_COLLECTION, id: STORY_DOC }] },
  achievements: { collections: [{ name: ACHIEVEMENTS_COLLECTION }], documents: [] },
  ranks: { collections: [], documents: [{ collection: EVENT_CONFIG_COLLECTION, id: RANKS_DOC }] },
  economy: { collections: [], documents: [{ collection: EVENT_CONFIG_COLLECTION, id: ECONOMY_DOC }] },
  minigames: { collections: [], documents: [{ collection: EVENT_CONFIG_COLLECTION, id: MINIGAMES_DOC }] },
  squadPrizes: { collections: [{ name: SQUAD_PRIZES_COLLECTION }], documents: [] },
};

/** Firestore's limit of writes per batch. */
const BATCH_SIZE = 450;

/** Fields about when a document was written in its own edition; the copy gets its own. */
const OWN_FIELDS = new Set(["createdAt", "updatedAt"]);

/**
 * Firestore adapter (Admin SDK) that reads an edition's parts and writes them into another edition. Copied documents
 * keep their ids (so references between them still work), lose their own timestamps and record where they came
 * from. Writes use `create`, so an existing document is never overwritten.
 */
export class FirestoreEditionCopier implements EditionCopier {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  private async documentsOf(eventId: string, part: CopyPart): Promise<EditionDocument[]> {
    const db = this.getDb();
    const source = PART_SOURCES[part];
    const found: EditionDocument[] = [];
    for (const { name, keep } of source.collections) {
      const snapshot = await eventCollection(db, eventId, name).get();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!keep || keep(data)) found.push({ path: `${name}/${doc.id}`, data });
      }
    }
    for (const { collection, id } of source.documents) {
      const snapshot = await eventCollection(db, eventId, collection).doc(id).get();
      const data = snapshot.data();
      if (snapshot.exists && data) found.push({ path: `${collection}/${id}`, data });
    }
    return found;
  }

  async isEmpty(eventId: string, part: CopyPart): Promise<Result<boolean, { code: string }>> {
    try {
      return ok((await this.documentsOf(eventId, part)).length === 0);
    } catch (cause) {
      logServerError("event.copier.isEmpty", cause);
      return err({ code: "unknown" });
    }
  }

  async read(eventId: string, part: CopyPart): Promise<Result<readonly EditionDocument[], { code: string }>> {
    try {
      const documents = await this.documentsOf(eventId, part);
      return ok(documents.map(({ path, data }) => ({ path, data: Object.fromEntries(Object.entries(data).filter(([key]) => !OWN_FIELDS.has(key))) })));
    } catch (cause) {
      logServerError("event.copier.read", cause);
      return err({ code: "unknown" });
    }
  }

  async write(eventId: string, documents: readonly EditionDocument[], copiedFrom: string): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const edition = eventDocument(db, eventId);
      const now = new Date();
      for (let start = 0; start < documents.length; start += BATCH_SIZE) {
        const batch = db.batch();
        for (const { path, data } of documents.slice(start, start + BATCH_SIZE)) {
          const [collection, id] = path.split("/");
          batch.create(edition.collection(collection).doc(id), { ...data, createdAt: now, copiedFrom });
        }
        await batch.commit();
      }
      return ok(undefined);
    } catch (cause) {
      logServerError("event.copier.write", cause);
      return err({ code: "unknown" });
    }
  }
}
