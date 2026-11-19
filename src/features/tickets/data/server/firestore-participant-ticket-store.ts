import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { ParticipantTicket, ParticipantTicketStore } from "../../domain/ports";
import { isTicketSource, ticketTypeOf, type TicketSource, type TicketType } from "../../domain/ticket";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

/**
 * A participant document's ticket. A profile from before tickets existed has no ticket fields: it reads as a general
 * ticket that came by default.
 */
export function readTicket(data: Record<string, unknown> | undefined): ParticipantTicket {
  return {
    type: ticketTypeOf(data?.ticketType),
    source: isTicketSource(data?.ticketSource) ? data.ticketSource : "default",
    setBy: typeof data?.ticketSetBy === "string" && data.ticketSetBy.length > 0 ? data.ticketSetBy : null,
    setAt: toDate(data?.ticketSetAt),
  };
}

/**
 * Firestore adapter (Admin SDK) over the ticket fields of `events/{eventId}/participants/{uid}`: only those four
 * fields are written, in a transaction, so the profile's other fields (owned by other features) are never touched.
 */
export class FirestoreParticipantTicketStore implements ParticipantTicketStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async participant(uid: string) {
    const db = this.getDb();
    return { db, ref: eventCollection(db, await this.getEventId(), PARTICIPANTS_COLLECTION).doc(uid) };
  }

  async get(uid: string): Promise<Result<ParticipantTicket | null, { code: string }>> {
    try {
      const { ref } = await this.participant(uid);
      const snapshot = await ref.get();
      return ok(snapshot.exists ? readTicket(snapshot.data()) : null);
    } catch (cause) {
      logServerError("tickets.participants.get", cause);
      return err({ code: "unknown" });
    }
  }

  async set(uid: string, ticket: { type: TicketType; source: TicketSource; by: string | null; at: Date }): Promise<Result<{ before: TicketType } | null, { code: string }>> {
    try {
      const { db, ref } = await this.participant(uid);
      return await db.runTransaction(async (tx): Promise<Result<{ before: TicketType } | null, { code: string }>> => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return ok(null);
        const before = ticketTypeOf(snapshot.data()?.ticketType);
        tx.update(ref, { ticketType: ticket.type, ticketSource: ticket.source, ticketSetBy: ticket.by, ticketSetAt: ticket.at });
        return ok({ before });
      });
    } catch (cause) {
      logServerError("tickets.participants.set", cause);
      return err({ code: "unknown" });
    }
  }
}
