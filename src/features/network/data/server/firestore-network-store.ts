import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { CONTACT_CARDS_COLLECTION, CONTACT_REWARDS_COLLECTION, CONTACTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { NO_LINKS, parseStoredLinks, type ContactLinks } from "../../domain/links";
import { contactId, type CardStore, type Contact, type ContactStore } from "../../domain/network";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

/** A stored contact, or `null` when it breaks the rules (its id must be its own sorted pair). */
function toContact(id: string, data: Record<string, unknown> | undefined): Contact | null {
  if (!data || !Array.isArray(data.uids) || data.uids.length !== 2) return null;
  const [a, b] = data.uids;
  const createdAt = toDate(data.createdAt);
  if (typeof a !== "string" || typeof b !== "string" || a >= b || id !== contactId(a, b) || typeof data.scannedBy !== "string" || !createdAt) return null;
  return { id, uids: [a, b], scannedBy: data.scannedBy, createdAt };
}

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/contacts/{uidA}_{uidB}` (the sorted pair is the id, so a
 * pair is one contact however many times or in whichever direction it is scanned) and
 * `events/{eventId}/contactCards/{uid}` (the links each cadet chose to show) and `events/{eventId}/contactRewards/{uid}`
 * (the other cadets of their paid slots).
 */
export class FirestoreNetworkStore implements ContactStore, CardStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection(name: typeof CONTACTS_COLLECTION | typeof CONTACT_CARDS_COLLECTION | typeof CONTACT_REWARDS_COLLECTION) {
    const db = this.getDb();
    return { db, collection: eventCollection(db, await this.getEventId(), name) };
  }

  async connect(contact: Contact): Promise<Result<{ contact: Contact; created: boolean }, { code: string }>> {
    try {
      const { db, collection } = await this.collection(CONTACTS_COLLECTION);
      const ref = collection.doc(contact.id);
      return await db.runTransaction(async (tx): Promise<Result<{ contact: Contact; created: boolean }, { code: string }>> => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) {
          const stored = toContact(ref.id, snapshot.data());
          if (!stored) {
            logServerError("network.contacts.parse", new Error(`contact ${ref.id} breaks the rules`));
            return err({ code: "unknown" });
          }
          return ok({ contact: stored, created: false });
        }
        tx.create(ref, { uids: [...contact.uids], scannedBy: contact.scannedBy, createdAt: contact.createdAt });
        return ok({ contact, created: true });
      });
    } catch (cause) {
      logServerError("network.contacts.connect", cause);
      return err({ code: "unknown" });
    }
  }

  async reserveRewardSlot(uid: string, other: string, cap: number): Promise<Result<boolean, { code: string }>> {
    try {
      const { db, collection } = await this.collection(CONTACT_REWARDS_COLLECTION);
      const ref = collection.doc(uid);
      return await db.runTransaction(async (tx): Promise<Result<boolean, { code: string }>> => {
        const stored: unknown = (await tx.get(ref)).data()?.paid;
        const paid = Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string") : [];
        if (paid.includes(other)) return ok(true);
        if (paid.length >= cap) return ok(false);
        tx.set(ref, { paid: [...paid, other] });
        return ok(true);
      });
    } catch (cause) {
      logServerError("network.contacts.reserve", cause);
      return err({ code: "unknown" });
    }
  }

  async listFor(uid: string): Promise<Result<readonly Contact[], { code: string }>> {
    try {
      const { collection } = await this.collection(CONTACTS_COLLECTION);
      const snapshot = await collection.where("uids", "array-contains", uid).get();
      return ok(snapshot.docs.flatMap((doc) => toContact(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("network.contacts.list", cause);
      return err({ code: "unknown" });
    }
  }

  async countFor(uid: string): Promise<Result<number, { code: string }>> {
    try {
      const { collection } = await this.collection(CONTACTS_COLLECTION);
      // An aggregation costs one read per 1000 contacts, instead of one read per contact.
      const snapshot = await collection.where("uids", "array-contains", uid).count().get();
      return ok(snapshot.data().count);
    } catch (cause) {
      logServerError("network.contacts.count", cause);
      return err({ code: "unknown" });
    }
  }

  async linksOf(uids: readonly string[]): Promise<Result<ReadonlyMap<string, ContactLinks>, { code: string }>> {
    if (uids.length === 0) return ok(new Map());
    try {
      const { db, collection } = await this.collection(CONTACT_CARDS_COLLECTION);
      const snapshots = await db.getAll(...uids.map((uid) => collection.doc(uid)));
      return ok(new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.exists ? parseStoredLinks(snapshot.data()) : NO_LINKS])));
    } catch (cause) {
      logServerError("network.cards.read", cause);
      return err({ code: "unknown" });
    }
  }

  async saveLinks(uid: string, links: ContactLinks): Promise<Result<void, { code: string }>> {
    try {
      const { collection } = await this.collection(CONTACT_CARDS_COLLECTION);
      await collection.doc(uid).set({ ...links, updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("network.cards.save", cause);
      return err({ code: "unknown" });
    }
  }
}
