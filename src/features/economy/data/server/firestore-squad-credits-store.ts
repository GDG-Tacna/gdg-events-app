import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { SQUAD_LEDGER_COLLECTION, SQUAD_PRIZES_COLLECTION, SQUAD_REDEMPTIONS_COLLECTION, SQUAD_WALLETS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parsePrize, type PrizePatch, type SquadCreditsStore, type SquadPrize, type SquadRedemption, type SquadWallet } from "../../domain/squad-credits";

const numberOr0 = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const toWallet = (squadId: string, data: Record<string, unknown> | undefined): SquadWallet => ({
  squadId,
  balance: numberOr0(data?.balance),
  earned: numberOr0(data?.earned),
  spent: numberOr0(data?.spent),
});
const toDate = (value: unknown): Date =>
  value instanceof Date ? value : typeof (value as { toDate?: unknown })?.toDate === "function" ? (value as { toDate: () => Date }).toDate() : new Date(0);
/** A stored prize, its image kept as a path whose address is rebuilt here. */
function toPrize(id: string, data: unknown): SquadPrize | null {
  const prize = parsePrize(id, data);
  if (!prize) return null;
  const path = (data as { imagePath?: unknown }).imagePath;
  return { ...prize, image: typeof path === "string" ? imageRefOf(path, "squad-prize") : null };
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over one edition's squad credits: `squadWallets/{squadId}`, the ledger
 * `squadLedger`, the prizes `squadPrizes` and the redemptions `squadRedemptions/{operationId}`. Bonuses and
 * redemptions are keyed by an operation id so a repeated request changes nothing; a redemption checks the
 * balance and the stock and writes everything in one transaction.
 */
export class FirestoreSquadCreditsStore implements SquadCreditsStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async collection(name: Parameters<typeof eventCollection>[2]) {
    return eventCollection(this.getDb(), await this.getEventId(), name);
  }

  async wallets(): Promise<Result<readonly SquadWallet[], { code: string }>> {
    try {
      const snapshot = await (await this.collection(SQUAD_WALLETS_COLLECTION)).get();
      return ok(snapshot.docs.map((doc) => toWallet(doc.id, doc.data())));
    } catch (cause) {
      logServerError("squadCredits.wallets", cause);
      return err({ code: "unknown" });
    }
  }

  async wallet(squadId: string): Promise<Result<SquadWallet, { code: string }>> {
    try {
      const snapshot = await (await this.collection(SQUAD_WALLETS_COLLECTION)).doc(squadId).get();
      return ok(toWallet(squadId, snapshot.data()));
    } catch (cause) {
      logServerError("squadCredits.wallet", cause);
      return err({ code: "unknown" });
    }
  }

  async addBonus(input: { squadId: string; amount: number; reason: string; operationId: string; actorUid: string }): Promise<Result<{ added: boolean; balance: number }, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const walletRef = eventCollection(db, eventId, SQUAD_WALLETS_COLLECTION).doc(input.squadId);
      const entryRef = eventCollection(db, eventId, SQUAD_LEDGER_COLLECTION).doc(`bonus_${input.operationId}`);
      return await db.runTransaction(async (tx) => {
        const [wallet, entry] = await Promise.all([tx.get(walletRef), tx.get(entryRef)]);
        const current = toWallet(input.squadId, wallet.data());
        if (entry.exists) return ok({ added: false, balance: current.balance });
        const at = this.now();
        tx.create(entryRef, { squadId: input.squadId, kind: "bonus", amount: input.amount, reason: input.reason, actorUid: input.actorUid, at });
        tx.set(walletRef, { balance: current.balance + input.amount, earned: current.earned + input.amount, spent: current.spent, updatedAt: at }, { merge: true });
        return ok({ added: true, balance: current.balance + input.amount });
      });
    } catch (cause) {
      logServerError("squadCredits.bonus", cause);
      return err({ code: "unknown" });
    }
  }

  async prizes(): Promise<Result<readonly SquadPrize[], { code: string }>> {
    try {
      const snapshot = await (await this.collection(SQUAD_PRIZES_COLLECTION)).get();
      const prizes: SquadPrize[] = [];
      for (const doc of snapshot.docs) {
        const prize = toPrize(doc.id, doc.data());
        if (prize) prizes.push(prize);
        else logServerError("squadCredits.prize.parse", new Error(`prize ${doc.id} cannot be offered`));
      }
      return ok(prizes);
    } catch (cause) {
      logServerError("squadCredits.prizes", cause);
      return err({ code: "unknown" });
    }
  }

  async createPrize(prize: SquadPrize): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const { id, image, ...data } = prize;
      await (await this.collection(SQUAD_PRIZES_COLLECTION)).doc(id).create({ ...data, imagePath: image?.path ?? null, createdAt: this.now() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("squadCredits.prize.create", cause);
      return err({ code: "unknown" });
    }
  }

  async updatePrize(id: string, patch: PrizePatch): Promise<Result<{ before: SquadPrize; after: SquadPrize } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = eventCollection(db, await this.getEventId(), SQUAD_PRIZES_COLLECTION).doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toPrize(id, snapshot.data()) : null;
        if (!before) return ok(null);
        const { image, ...rest } = patch;
        const fields: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
        if (image !== undefined) fields.imagePath = image?.path ?? null;
        tx.update(ref, fields);
        const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        return ok({ before, after: { ...before, ...changes } as SquadPrize });
      });
    } catch (cause) {
      logServerError("squadCredits.prize.update", cause);
      return err({ code: "unknown" });
    }
  }

  async redeem(input: { squadId: string; prizeId: string; operationId: string; actorUid: string }): Promise<
    Result<{ redeemed: boolean; balance: number }, { code: "not-found" | "inactive" | "insufficient" | "out-of-stock" | "unknown" }>
  > {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const walletRef = eventCollection(db, eventId, SQUAD_WALLETS_COLLECTION).doc(input.squadId);
      const prizeRef = eventCollection(db, eventId, SQUAD_PRIZES_COLLECTION).doc(input.prizeId);
      const redemptionRef = eventCollection(db, eventId, SQUAD_REDEMPTIONS_COLLECTION).doc(input.operationId);
      return await db.runTransaction(async (tx) => {
        const [wallet, prizeDoc, existing] = await Promise.all([tx.get(walletRef), tx.get(prizeRef), tx.get(redemptionRef)]);
        const current = toWallet(input.squadId, wallet.data());
        if (existing.exists) return ok({ redeemed: false, balance: current.balance });
        const prize = prizeDoc.exists ? toPrize(input.prizeId, prizeDoc.data()) : null;
        if (!prize) return err({ code: "not-found" as const });
        if (!prize.active) return err({ code: "inactive" as const });
        if (prize.stock === 0) return err({ code: "out-of-stock" as const });
        if (current.balance < prize.cost) return err({ code: "insufficient" as const });

        const at = this.now();
        tx.create(redemptionRef, { squadId: input.squadId, prizeId: prize.id, prizeName: prize.name, cost: prize.cost, actorUid: input.actorUid, at });
        tx.set(walletRef, { balance: current.balance - prize.cost, earned: current.earned, spent: current.spent + prize.cost, updatedAt: at }, { merge: true });
        if (prize.stock !== null) tx.update(prizeRef, { stock: prize.stock - 1 });
        return ok({ redeemed: true, balance: current.balance - prize.cost });
      });
    } catch (cause) {
      logServerError("squadCredits.redeem", cause);
      return err({ code: "unknown" });
    }
  }

  async redemptions(limit: number): Promise<Result<readonly SquadRedemption[], { code: string }>> {
    try {
      const snapshot = await (await this.collection(SQUAD_REDEMPTIONS_COLLECTION)).orderBy("at", "desc").limit(limit).get();
      return ok(
        snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            squadId: String(data.squadId ?? ""),
            prizeId: String(data.prizeId ?? ""),
            prizeName: String(data.prizeName ?? ""),
            cost: numberOr0(data.cost),
            actorUid: String(data.actorUid ?? ""),
            at: toDate(data.at),
          };
        }),
      );
    } catch (cause) {
      logServerError("squadCredits.redemptions", cause);
      return err({ code: "unknown" });
    }
  }
}
