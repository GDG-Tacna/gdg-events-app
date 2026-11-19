import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { TICKET_HOLDERS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { TicketHolder, TicketHolderStore } from "../../domain/ports";
import { TICKET_TYPES, isTicketType, type TicketType } from "../../domain/ticket";

/** Writes per batch: well under Firestore's 500. */
const BATCH = 400;

/** An email is the key of its line; it may hold characters a document id cannot (a slash), so it is encoded. */
export const holderDocId = (email: string) => encodeURIComponent(email);

/**
 * Firestore adapter (Admin SDK) over the edition's list of ticket holders, `events/{eventId}/ticketHolders/{email}`.
 * It holds personal data (email, full name), so the rules deny every client access and editions do not copy it.
 */
export class FirestoreTicketHolderStore implements TicketHolderStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async holders() {
    return eventCollection(this.getDb(), await this.getEventId(), TICKET_HOLDERS_COLLECTION);
  }

  async get(email: string): Promise<Result<TicketHolder | null, { code: string }>> {
    try {
      const snapshot = await (await this.holders()).doc(holderDocId(email)).get();
      if (!snapshot.exists) return ok(null);
      const data = snapshot.data() ?? {};
      if (!isTicketType(data.type)) return ok(null);
      return ok({ email, fullName: typeof data.fullName === "string" ? data.fullName : "", type: data.type });
    } catch (cause) {
      logServerError("tickets.holders.get", cause);
      return err({ code: "unknown" });
    }
  }

  async upsertMany(holders: readonly TicketHolder[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const collection = await this.holders();
      const at = new Date();
      for (let from = 0; from < holders.length; from += BATCH) {
        const batch = db.batch();
        for (const holder of holders.slice(from, from + BATCH)) {
          batch.set(collection.doc(holderDocId(holder.email)), { email: holder.email, fullName: holder.fullName, type: holder.type, updatedAt: at });
        }
        await batch.commit();
      }
      return ok(undefined);
    } catch (cause) {
      logServerError("tickets.holders.upsertMany", cause);
      return err({ code: "unknown" });
    }
  }

  async countByType(): Promise<Result<Record<TicketType, number>, { code: string }>> {
    try {
      const collection = await this.holders();
      const counted = await Promise.all(TICKET_TYPES.map(async (type) => [type, (await collection.where("type", "==", type).count().get()).data().count] as const));
      return ok(Object.fromEntries(counted) as Record<TicketType, number>);
    } catch (cause) {
      logServerError("tickets.holders.countByType", cause);
      return err({ code: "unknown" });
    }
  }
}
