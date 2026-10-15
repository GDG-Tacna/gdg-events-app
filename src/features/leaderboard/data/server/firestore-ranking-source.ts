import "server-only";
import { AggregateField, type Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { PARTICIPANTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { compareEntries, participantEntry, type RankingEntry, type RankingSource } from "../../domain/ranking";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

/** A participant the ranking shows: usable and with XP. */
const toEntry = (uid: string, data: Record<string, unknown> | undefined): RankingEntry | null => {
  const entry = participantEntry(uid, data);
  return entry && entry.xp > 0 ? entry : null;
};

/**
 * The ranking read from `events/{eventId}/participants` (Admin SDK). The top is one ordered read plus the block
 * of cadets tied at its edge, so no composite index is needed for it; a cadet's place is two `count()`
 * aggregations and squad totals one `sum()` per squad, so nothing is read document by document and no counter
 * document is written on every reward.
 */
export class FirestoreRankingSource implements RankingSource {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async participants() {
    return eventCollection(this.getDb(), await this.getEventId(), PARTICIPANTS_COLLECTION);
  }

  async top(limit: number): Promise<Result<readonly RankingEntry[], { code: string }>> {
    try {
      const participants = await this.participants();
      const read = (await participants.orderBy("xp", "desc").limit(limit).get()).docs;
      const first = read.flatMap((doc) => toEntry(doc.id, doc.data()) ?? []);
      // Fewer documents than places means everyone was read (an unusable one does not mean the list is short).
      if (read.length < limit || first.length === 0) return ok([...first].sort(compareEntries));
      // Who is in the last places depends on who reached that XP first: read everyone tied at the edge.
      const edge = first[first.length - 1].xp;
      const tied = (await participants.where("xp", "==", edge).get()).docs.flatMap((doc) => toEntry(doc.id, doc.data()) ?? []);
      return ok([...first.filter((entry) => entry.xp > edge), ...tied].sort(compareEntries).slice(0, limit));
    } catch (cause) {
      logServerError("leaderboard.ranking.top", cause);
      return err({ code: "unknown" });
    }
  }

  async placeOf(uid: string): Promise<Result<{ xp: number; ahead: number } | null, { code: string }>> {
    try {
      const participants = await this.participants();
      const snapshot = await participants.doc(uid).get();
      if (!snapshot.exists) return ok(null);
      const data = snapshot.data() ?? {};
      const xp = typeof data.xp === "number" && Number.isFinite(data.xp) ? data.xp : 0;
      if (xp <= 0) return ok({ xp: 0, ahead: 0 });
      const reachedAt = toDate(data.xpReachedAt);
      const [more, earlier] = await Promise.all([
        participants.where("xp", ">", xp).count().get(),
        reachedAt ? participants.where("xp", "==", xp).where("xpReachedAt", "<", reachedAt).count().get() : null,
      ]);
      return ok({ xp, ahead: more.data().count + (earlier?.data().count ?? 0) });
    } catch (cause) {
      logServerError("leaderboard.ranking.place", cause);
      return err({ code: "unknown" });
    }
  }

  async total(): Promise<Result<number, { code: string }>> {
    try {
      return ok((await (await this.participants()).count().get()).data().count);
    } catch (cause) {
      logServerError("leaderboard.ranking.total", cause);
      return err({ code: "unknown" });
    }
  }

  async squadTotals(squadIds: readonly string[]): Promise<Result<ReadonlyMap<string, { xp: number; members: number }>, { code: string }>> {
    try {
      const participants = await this.participants();
      const totals = await Promise.all(
        squadIds.map(async (id) => {
          const snapshot = await participants.where("squad", "==", id).aggregate({ xp: AggregateField.sum("xp"), members: AggregateField.count() }).get();
          const { xp, members } = snapshot.data();
          return [id, { xp: Number(xp) || 0, members: Number(members) || 0 }] as const;
        }),
      );
      return ok(new Map(totals));
    } catch (cause) {
      logServerError("leaderboard.ranking.squads", cause);
      return err({ code: "unknown" });
    }
  }
}
