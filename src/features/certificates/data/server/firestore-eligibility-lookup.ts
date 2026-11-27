import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isTicketType, ticketTypeOf, type TicketType } from "@/features/tickets";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  EDITION_TEAM_COLLECTION,
  PARTICIPANTS_COLLECTION,
  SPEAKERS_COLLECTION,
  TICKET_HOLDERS_COLLECTION,
  eventCollection,
  eventDocument,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isEventId } from "@/shared/types/event";
import type { EligibilityCandidate } from "../../domain/eligibility";
import type { CertificateEditionInfo, CertificateEditionInfoReader, EligibilityLookup } from "../../domain/ports";
import type { CertificateTeamRole } from "../../domain/template";
import { toDate } from "./certificate.mapper";

const holderDocId = (email: string) => encodeURIComponent(email.trim().toLowerCase());

/**
 * Reads participant profile, ticket holder import row, edition team role and linked speaker
 * in parallel for one `(eventId, uid, email)` tuple (at most 4 small reads).
 */
export class FirestoreEligibilityLookup implements EligibilityLookup {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  async lookup(input: { eventId: string; uid: string; email: string | null }): Promise<
    Result<{ candidate: EligibilityCandidate; ticketHolderName: string | null; speakerName: string | null }, { code: string }>
  > {
    try {
      const db = this.getDb();
      const email = input.email ? input.email.trim().toLowerCase() : null;

      const [participantSnap, holderSnap, teamSnap, speakersSnap] = await Promise.all([
        eventCollection(db, input.eventId, PARTICIPANTS_COLLECTION).doc(input.uid).get(),
        email ? eventCollection(db, input.eventId, TICKET_HOLDERS_COLLECTION).doc(holderDocId(email)).get() : Promise.resolve(null),
        eventCollection(db, input.eventId, EDITION_TEAM_COLLECTION).doc(input.uid).get(),
        eventCollection(db, input.eventId, SPEAKERS_COLLECTION).where("accountUid", "==", input.uid).get(),
      ]);

      const participant = participantSnap.exists ? participantSnap.data() : undefined;
      const holder = holderSnap?.exists ? holderSnap.data() : undefined;
      const team = teamSnap.exists ? teamSnap.data() : undefined;
      const activeSpeaker = speakersSnap.docs.find((doc) => doc.data().active !== false);

      let ticketType: TicketType | null = null;
      if (participant) {
        ticketType = ticketTypeOf(participant.ticketType);
      } else if (holder && isTicketType(holder.type)) {
        ticketType = holder.type;
      }

      const rawTeamRole = team?.role;
      const editionTeamRole: CertificateTeamRole | null =
        rawTeamRole === "staff" || rawTeamRole === "organizer" ? rawTeamRole : null;

      const candidate: EligibilityCandidate = {
        uid: input.uid,
        email,
        hasParticipant: participantSnap.exists,
        hasTicketHolder: Boolean(holderSnap?.exists),
        ticketType,
        attendedAt: toDate(participant?.attendedAt),
        isSpeaker: Boolean(activeSpeaker),
        editionTeamRole,
      };

      const ticketHolderName = typeof holder?.fullName === "string" && holder.fullName.trim() !== "" ? holder.fullName : null;
      const speakerName = activeSpeaker && typeof activeSpeaker.data().name === "string" ? (activeSpeaker.data().name as string) : null;

      return ok({ candidate, ticketHolderName, speakerName });
    } catch (cause) {
      logServerError("certificates.eligibility.lookup", cause);
      return err({ code: "unknown" });
    }
  }
}

/** Reads edition metadata (`name`, `startsAt`, `endsAt`) for certificate issuance and defaults. */
export class FirestoreCertificateEditionReader implements CertificateEditionInfoReader {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async current(): Promise<Result<CertificateEditionInfo, { code: string }>> {
    try {
      const id = await this.getEventId();
      const found = await this.getById(id);
      if (!found.ok) return found;
      return ok(found.value ?? { id, name: id, startsAt: null, endsAt: null });
    } catch (cause) {
      logServerError("certificates.editions.current", cause);
      return err({ code: "unknown" });
    }
  }

  async getById(eventId: string): Promise<Result<CertificateEditionInfo | null, { code: string }>> {
    try {
      if (!isEventId(eventId)) return ok(null);
      const snap = await eventDocument(this.getDb(), eventId).get();
      const data = snap.data();
      return ok({
        id: eventId,
        name: typeof data?.name === "string" && data.name.trim() !== "" ? data.name : eventId,
        startsAt: toDate(data?.startsAt),
        endsAt: toDate(data?.endsAt),
      });
    } catch (cause) {
      logServerError("certificates.editions.getById", cause);
      return err({ code: "unknown" });
    }
  }
}
