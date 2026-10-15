import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { ACHIEVEMENT_AWARDS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AwardStore } from "../../domain/achievements";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/achievementAwards/{uid}_{badgeId}`. The document id is
 * the idempotency key: `create` fails when the award exists, so two evaluations at once award it once.
 */
export class FirestoreAwardStore implements AwardStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async awardsOf(uid: string): Promise<Result<ReadonlyMap<string, Date>, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, ACHIEVEMENT_AWARDS_COLLECTION).where("uid", "==", uid).get();
      const awards = new Map<string, Date>();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const at = toDate(data.at);
        if (typeof data.badgeId === "string" && at) awards.set(data.badgeId, at);
      }
      return ok(awards);
    } catch (cause) {
      logServerError("achievements.awards.list", cause);
      return err({ code: "unknown" });
    }
  }

  async award(input: { uid: string; badgeId: string; at: Date }): Promise<Result<{ awarded: boolean }, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, ACHIEVEMENT_AWARDS_COLLECTION).doc(`${input.uid}_${input.badgeId}`).create({ ...input });
      return ok({ awarded: true });
    } catch (cause) {
      if (isAlreadyExists(cause)) return ok({ awarded: false });
      logServerError("achievements.awards.create", cause);
      return err({ code: "unknown" });
    }
  }
}
