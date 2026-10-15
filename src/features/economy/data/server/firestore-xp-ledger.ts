import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  PARTICIPANTS_COLLECTION,
  SQUAD_LEDGER_COLLECTION,
  SQUAD_WALLETS_COLLECTION,
  WALLETS_COLLECTION, WALLET_LEDGER_COLLECTION, XP_LEDGER_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { squadShare } from "../../domain/squad-credits";
import {
  isValidReward,
  ledgerEntryId,
  walletEarnId,
  xpError,
  type WalletSpender,
  type XpError,
  type XpGrant,
  type XpGrantOutcome,
  type XpLedger,
} from "../../domain/xp";

const numberOr0 = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * Firestore adapter (Admin SDK). One transaction per reward:
 * - the edition ledger entry `events/{e}/xpLedger/{uid}_{source}` (the idempotency key);
 * - `participants/{uid}`: `xp` and `credits` of this edition;
 * - for credits, the global wallet `wallets/{uid}` (balance, earned) and its entry `walletLedger/{e}_{uid}_{source}`.
 * - when the attendee belongs to a squad and squad credits are on, the squad's share of those credits
 *   (`squadRatio`) in `squadWallets/{squadId}` with its entry `squadLedger/{uid}_{source}`.
 * A repeated reward finds its entry and changes nothing. Spending is keyed per operation and never
 * leaves a negative balance (the future store).
 */
export class FirestoreXpLedger implements XpLedger, WalletSpender {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
    private readonly now: () => Date = () => new Date(),
    /** Squad credits per G-Credit for this edition; 0 when squad credits are off. */
    private readonly squadRatio: () => Promise<number> = async () => 0,
  ) {}

  async grant({ uid, source, xp, credits }: XpGrant): Promise<Result<XpGrantOutcome, XpError>> {
    if (!isValidReward(xp, credits)) return err(xpError("invalid-amount"));
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const participantRef = eventCollection(db, eventId, PARTICIPANTS_COLLECTION).doc(uid);
      const entryRef = eventCollection(db, eventId, XP_LEDGER_COLLECTION).doc(ledgerEntryId(uid, source));
      const walletRef = db.collection(WALLETS_COLLECTION).doc(uid);
      const ratio = credits > 0 ? await this.squadRatio() : 0;

      return await db.runTransaction(async (tx): Promise<Result<XpGrantOutcome, XpError>> => {
        const [participant, entry, wallet] = await Promise.all([tx.get(participantRef), tx.get(entryRef), tx.get(walletRef)]);
        if (!participant.exists) return err(xpError("not-registered"));
        const data = participant.data();
        const beforeXp = numberOr0(data?.xp);
        const beforeCredits = numberOr0(data?.credits);
        const balance = numberOr0(wallet.data()?.balance);
        if (entry.exists) return ok({ granted: false, total: beforeXp, balance });

        const squadId = typeof data?.squad === "string" && data.squad.length > 0 ? data.squad : null;
        const share = squadId ? squadShare(credits, ratio) : 0;
        const squadWalletRef = squadId && share > 0 ? eventCollection(db, eventId, SQUAD_WALLETS_COLLECTION).doc(squadId) : null;
        const squadWallet = squadWalletRef ? (await tx.get(squadWalletRef)).data() : undefined;

        const at = this.now();
        tx.create(entryRef, { uid, source, xp, credits, at });
        // When the XP changes, so does the moment it was reached: the ranking breaks ties by it (phase 6).
        tx.update(participantRef, { xp: beforeXp + xp, credits: beforeCredits + credits, ...(xp > 0 ? { xpReachedAt: at } : {}) });
        if (credits > 0) {
          tx.set(walletRef, { balance: balance + credits, earned: numberOr0(wallet.data()?.earned) + credits, spent: numberOr0(wallet.data()?.spent), updatedAt: at }, { merge: true });
          tx.create(db.collection(WALLET_LEDGER_COLLECTION).doc(walletEarnId(eventId, uid, source)), { uid, eventId, kind: "earn", source, amount: credits, at });
        }
        if (squadId && squadWalletRef) {
          tx.set(
            squadWalletRef,
            { balance: numberOr0(squadWallet?.balance) + share, earned: numberOr0(squadWallet?.earned) + share, spent: numberOr0(squadWallet?.spent), updatedAt: at },
            { merge: true },
          );
          tx.create(eventCollection(db, eventId, SQUAD_LEDGER_COLLECTION).doc(ledgerEntryId(uid, source)), { squadId, uid, source, kind: "contribution", amount: share, at });
        }
        return ok({ granted: true, total: beforeXp + xp, balance: balance + credits });
      });
    } catch (cause) {
      logServerError("economy.reward.grant", cause);
      return err(xpError("unknown"));
    }
  }

  async spend({ uid, operationId, amount, reason }: { uid: string; operationId: string; amount: number; reason: string }): Promise<Result<{ charged: boolean; balance: number }, XpError>> {
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000 || !/^[A-Za-z0-9_-]{1,80}$/.test(operationId)) return err(xpError("invalid-amount"));
    try {
      const db = this.getDb();
      const walletRef = db.collection(WALLETS_COLLECTION).doc(uid);
      const entryRef = db.collection(WALLET_LEDGER_COLLECTION).doc(`spend_${uid}_${operationId}`);
      return await db.runTransaction(async (tx): Promise<Result<{ charged: boolean; balance: number }, XpError>> => {
        const [wallet, entry] = await Promise.all([tx.get(walletRef), tx.get(entryRef)]);
        const balance = numberOr0(wallet.data()?.balance);
        if (entry.exists) return ok({ charged: false, balance });
        if (balance < amount) return err(xpError("insufficient"));
        const at = this.now();
        tx.create(entryRef, { uid, kind: "spend", operationId, amount, reason, at });
        tx.set(walletRef, { balance: balance - amount, spent: numberOr0(wallet.data()?.spent) + amount, updatedAt: at }, { merge: true });
        return ok({ charged: true, balance: balance - amount });
      });
    } catch (cause) {
      logServerError("economy.wallet.spend", cause);
      return err(xpError("unknown"));
    }
  }

  /** A person's G-Credits across every edition (0 when they have no wallet yet). */
  async balanceOf(uid: string): Promise<Result<number, XpError>> {
    try {
      const wallet = await this.getDb().collection(WALLETS_COLLECTION).doc(uid).get();
      return ok(numberOr0(wallet.data()?.balance));
    } catch (cause) {
      logServerError("economy.wallet.balance", cause);
      return err(xpError("unknown"));
    }
  }
}
