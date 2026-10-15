import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { ALIASES_COLLECTION, PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Alias } from "../../domain/alias";
import type { Attendee } from "../../domain/attendee";
import { attendeeError, type AttendeeError } from "../../domain/attendee-error";
import type { AttendeeRepository, RegisterOutcome } from "../../domain/ports";
import { mapUserDoc, toAliasDoc, toUserDoc } from "./attendee.mapper";

/** Firestore adapter (Admin SDK). The database handle is resolved lazily so importing this file never needs credentials. */
export class FirestoreAttendeeRepository implements AttendeeRepository {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async findByUid(uid: string): Promise<Result<Attendee | null, AttendeeError>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, PARTICIPANTS_COLLECTION).doc(uid).get();
      if (!snapshot.exists) return ok(null);

      const attendee = mapUserDoc(uid, snapshot.data());
      return attendee.ok ? ok(attendee.value) : err(attendeeError("unknown"));
    } catch (cause) {
      logServerError("attendee.findByUid", cause);
      return err(attendeeError("unknown"));
    }
  }

  async register(attendee: Attendee, alias: Alias): Promise<Result<RegisterOutcome, AttendeeError>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const userRef = eventCollection(db, eventId, PARTICIPANTS_COLLECTION).doc(attendee.uid);
      const aliasRef = eventCollection(db, eventId, ALIASES_COLLECTION).doc(alias.key);

      // One transaction: the alias reservation and the profile are created together or not at all.
      return await db.runTransaction(async (tx): Promise<Result<RegisterOutcome, AttendeeError>> => {
        const [userSnapshot, aliasSnapshot] = await Promise.all([tx.get(userRef), tx.get(aliasRef)]);

        if (userSnapshot.exists) {
          const existing = mapUserDoc(attendee.uid, userSnapshot.data());
          return existing.ok
            ? ok({ kind: "already-registered", attendee: existing.value })
            : err(attendeeError("unknown"));
        }
        if (aliasSnapshot.exists) return err(attendeeError("alias-taken"));

        tx.create(userRef, toUserDoc(attendee, alias));
        tx.create(aliasRef, toAliasDoc(attendee));
        return ok({ kind: "created" });
      });
    } catch (cause) {
      logServerError("attendee.register", cause);
      return err(attendeeError("unknown"));
    }
  }
}
