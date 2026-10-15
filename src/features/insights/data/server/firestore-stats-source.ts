import "server-only";
import type { Firestore, Query } from "firebase-admin/firestore";
import { getActiveEventId } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  CHECKINS_COLLECTION,
  CHECKPOINTS_COLLECTION,
  CONTACTS_COLLECTION,
  EVENTS_COLLECTION,
  MISSION_COMPLETIONS_COLLECTION,
  PARTICIPANTS_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { StatsSource } from "../../domain/stats";

/** The edition the app serves now (`config/app`, cached a minute). */
export const currentEventId = (): Promise<string> => getActiveEventId();

/**
 * Firestore adapter (Admin SDK) for the admin's home. Every number is a `count()` aggregation (one read per 1000
 * entries), never a read of the documents. Editions are listed with `listDocuments`, which also finds an edition whose
 * own document was never written (only its subcollections were).
 */
export class FirestoreStatsSource implements StatsSource {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  private async count(scope: string, query: (db: Firestore) => Query): Promise<Result<number, { code: string }>> {
    try {
      return ok((await query(this.getDb()).count().get()).data().count);
    } catch (cause) {
      logServerError(`insights.${scope}`, cause);
      return err({ code: "unknown" });
    }
  }

  async editions(): Promise<Result<readonly string[], { code: string }>> {
    try {
      return ok((await this.getDb().collection(EVENTS_COLLECTION).listDocuments()).map((ref) => ref.id));
    } catch (cause) {
      logServerError("insights.editions", cause);
      return err({ code: "unknown" });
    }
  }

  registered(eventId: string) {
    return this.count("registered", (db) => eventCollection(db, eventId, PARTICIPANTS_COLLECTION));
  }

  attended(eventId: string) {
    return this.count("attended", (db) => eventCollection(db, eventId, PARTICIPANTS_COLLECTION).where("attendedAt", "!=", null));
  }

  checkInsOfKind(eventId: string, kind: "talk" | "stand") {
    return this.count("checkIns", (db) => eventCollection(db, eventId, CHECKINS_COLLECTION).where("kind", "==", kind));
  }

  missionsCompleted(eventId: string) {
    return this.count("missions", (db) => eventCollection(db, eventId, MISSION_COMPLETIONS_COLLECTION).where("status", "==", "completed"));
  }

  contacts(eventId: string) {
    return this.count("contacts", (db) => eventCollection(db, eventId, CONTACTS_COLLECTION));
  }

  async rations(eventId: string): Promise<Result<ReadonlyArray<{ checkpointId: string; name: string; count: number }>, { code: string }>> {
    try {
      const db = this.getDb();
      const meals = await eventCollection(db, eventId, CHECKPOINTS_COLLECTION).where("kind", "==", "catering").get();
      const counted = await Promise.all(
        meals.docs.map(async (doc) => {
          const count = (await eventCollection(db, eventId, CHECKINS_COLLECTION).where("checkpointId", "==", doc.id).count().get()).data().count;
          const name = doc.data().name;
          return { checkpointId: doc.id, name: typeof name === "string" && name.trim() !== "" ? name : doc.id, count };
        }),
      );
      return ok(counted);
    } catch (cause) {
      logServerError("insights.rations", cause);
      return err({ code: "unknown" });
    }
  }
}
