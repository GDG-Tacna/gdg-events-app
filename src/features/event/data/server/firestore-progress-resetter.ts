import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  ACHIEVEMENT_AWARDS_COLLECTION,
  CONTACT_REWARDS_COLLECTION,
  MINIGAME_PLAYS_COLLECTION,
  MISSION_COMPLETIONS_COLLECTION,
  PARTICIPANTS_COLLECTION,
  SQUAD_LEDGER_COLLECTION,
  SQUAD_PRIZES_COLLECTION,
  SQUAD_REDEMPTIONS_COLLECTION,
  SQUAD_WALLETS_COLLECTION,
  WALLETS_COLLECTION,
  WALLET_LEDGER_COLLECTION,
  XP_LEDGER_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { ProgressResetSummary, ProgressResetter } from "../../domain/progress-reset";

/** The collections of an edition that only hold what the cadets did to earn: every document goes. */
const HISTORY = [XP_LEDGER_COLLECTION, MISSION_COMPLETIONS_COLLECTION, ACHIEVEMENT_AWARDS_COLLECTION, MINIGAME_PLAYS_COLLECTION, CONTACT_REWARDS_COLLECTION, SQUAD_LEDGER_COLLECTION, SQUAD_WALLETS_COLLECTION] as const;

/** How many wallets are fixed at the same time: enough to be quick, few enough not to overload one request. */
const WALLETS_AT_ONCE = 25;

const numberOr0 = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * Firestore adapter (Admin SDK) that clears an edition's progress (see \`domain/progress-reset.ts\`). The G-Credits the
 * edition gave leave the global wallets one wallet per transaction (its balance goes down by what this edition's entries
 * added, and the entries are deleted with it), so a wallet is never left half way and a run can be repeated. Everything
 * else is plain deletes and updates, done in bulk. Credits and entries of other editions are never touched.
 */
export class FirestoreProgressResetter implements ProgressResetter {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reset(eventId: string): Promise<Result<ProgressResetSummary, { code: string }>> {
    try {
      const db = this.getDb();
      let documents = 0;

      documents += await this.takeBackCredits(db, eventId);
      documents += await this.returnPrizes(db, eventId);

      const writer = db.bulkWriter();
      for (const name of HISTORY) {
        const snapshot = await eventCollection(db, eventId, name).select().get();
        snapshot.docs.forEach((doc) => void writer.delete(doc.ref));
        documents += snapshot.size;
      }
      const redemptions = await eventCollection(db, eventId, SQUAD_REDEMPTIONS_COLLECTION).select().get();
      redemptions.docs.forEach((doc) => void writer.delete(doc.ref));
      documents += redemptions.size;

      const participants = await eventCollection(db, eventId, PARTICIPANTS_COLLECTION).select().get();
      // The moment the XP was reached breaks ties in the ranking: with no XP there is none.
      participants.docs.forEach((doc) => void writer.update(doc.ref, { xp: 0, credits: 0, xpReachedAt: FieldValue.delete() }));
      await writer.close();

      return ok({ cadets: participants.size, documents: documents + participants.size });
    } catch (cause) {
      logServerError("event.progress-reset.run", cause);
      return err({ code: "unknown" });
    }
  }

  /** The credits this edition gave leave each global wallet, with their entries; spends and other editions stay. Answers the entries deleted. */
  private async takeBackCredits(db: Firestore, eventId: string): Promise<number> {
    const entries = await db.collection(WALLET_LEDGER_COLLECTION).where("eventId", "==", eventId).get();
    const byUid = new Map<string, DocumentReference[]>();
    for (const doc of entries.docs) {
      const uid = doc.data().uid;
      if (typeof uid !== "string" || uid.length === 0) continue;
      byUid.set(uid, [...(byUid.get(uid) ?? []), doc.ref]);
    }
    const uids = [...byUid.keys()];
    for (let from = 0; from < uids.length; from += WALLETS_AT_ONCE) {
      await Promise.all(uids.slice(from, from + WALLETS_AT_ONCE).map((uid) => this.fixWallet(db, uid, byUid.get(uid) ?? [])));
    }
    return entries.size;
  }

  private async fixWallet(db: Firestore, uid: string, refs: readonly DocumentReference[]): Promise<void> {
    const walletRef = db.collection(WALLETS_COLLECTION).doc(uid);
    await db.runTransaction(async (tx) => {
      const [wallet, ...entries] = await Promise.all([tx.get(walletRef), ...refs.map((ref) => tx.get(ref))]);
      // Only entries that are still there count: a wallet already fixed by an earlier run is not charged twice.
      const live = entries.filter((entry) => entry.exists && entry.data()?.kind === "earn");
      const taken = live.reduce((sum, entry) => sum + numberOr0(entry.data()?.amount), 0);
      if (taken > 0) {
        const data = wallet.data();
        tx.set(walletRef, { balance: Math.max(0, numberOr0(data?.balance) - taken), earned: Math.max(0, numberOr0(data?.earned) - taken), updatedAt: this.now() }, { merge: true });
      }
      entries.filter((entry) => entry.exists).forEach((entry) => tx.delete(entry.ref));
    });
  }

  /**
   * The prizes the squads redeemed go back to the stock (those with a limited stock), each prize in one transaction
   * that also deletes the redemptions it counted, so a repeated run never returns the same prize twice. Answers the prizes changed.
   */
  private async returnPrizes(db: Firestore, eventId: string): Promise<number> {
    const redemptions = await eventCollection(db, eventId, SQUAD_REDEMPTIONS_COLLECTION).get();
    const byPrize = new Map<string, DocumentReference[]>();
    for (const doc of redemptions.docs) {
      const prizeId = doc.data().prizeId;
      if (typeof prizeId === "string") byPrize.set(prizeId, [...(byPrize.get(prizeId) ?? []), doc.ref]);
    }
    let changed = 0;
    for (const [prizeId, refs] of byPrize) {
      const ref = eventCollection(db, eventId, SQUAD_PRIZES_COLLECTION).doc(prizeId);
      const updated = await db.runTransaction(async (tx) => {
        const [prize, ...given] = await Promise.all([tx.get(ref), ...refs.map((redemption) => tx.get(redemption))]);
        const live = given.filter((redemption) => redemption.exists);
        const stock = prize.data()?.stock;
        // A prize without a limit has no stock to give back, and one that was deleted has nothing to return to.
        if (!prize.exists || typeof stock !== "number" || live.length === 0) return false;
        tx.update(ref, { stock: stock + live.length });
        live.forEach((redemption) => tx.delete(redemption.ref));
        return true;
      });
      if (updated) changed += 1;
    }
    return changed;
  }
}
