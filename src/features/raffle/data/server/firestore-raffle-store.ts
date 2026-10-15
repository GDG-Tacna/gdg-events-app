import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, PARTICIPANTS_COLLECTION, RAFFLE_DRAWS_COLLECTION, RAFFLE_PRIZES_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseRaffleSettings, type Entrant, type NewDraw, type RaffleDraw, type RaffleErrorCode, type RafflePrize, type RaffleSettings, type RaffleStore } from "../../domain/raffle";

const SETTINGS_DOC = "raffle";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};
const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

function toPrize(id: string, data: Record<string, unknown> | undefined): RafflePrize | null {
  if (!data || typeof data.name !== "string") return null;
  const quantity = count(data.quantity);
  const awarded = count(data.awarded);
  const drawSeq = count(data.drawSeq);
  if (!quantity || awarded === null || drawSeq === null) return null;
  const image = typeof data.imagePath === "string" ? imageRefOf(data.imagePath, "raffle-prize") : null;
  return { id, name: data.name, quantity, awarded, drawSeq, active: data.active === true, order: typeof data.order === "number" ? data.order : Number.MAX_SAFE_INTEGER, image };
}

function toDraw(id: string, data: Record<string, unknown> | undefined): RaffleDraw | null {
  const at = toDate(data?.at);
  if (!data || !at || typeof data.prizeId !== "string" || typeof data.prizeName !== "string" || typeof data.winnerUid !== "string" || typeof data.winnerAlias !== "string") return null;
  const tickets = count(data.tickets);
  const totalTickets = count(data.totalTickets);
  const entrants = count(data.entrants);
  if (tickets === null || totalTickets === null || entrants === null) return null;
  return {
    id,
    prizeId: data.prizeId,
    prizeName: data.prizeName,
    winnerUid: data.winnerUid,
    winnerAlias: data.winnerAlias,
    winnerSquadId: typeof data.winnerSquadId === "string" ? data.winnerSquadId : null,
    tickets,
    totalTickets,
    entrants,
    at,
    voided: data.voided === true,
  };
}

/**
 * Firestore adapter (Admin SDK) for the raffle: `config/raffle`, `rafflePrizes/{id}` and `raffleDraws/{prizeId}-{n}`.
 * A draw and a void are transactions over the prize and the draws, so two admins (or two taps) never give the same
 * unit twice or more units than the prize has. Entrants are read from the participants (their G-Credits of the
 * edition) outside the transaction, so the draw never holds the profiles every reward writes to.
 */
export class FirestoreRaffleStore implements RaffleStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async scope() {
    const db = this.getDb();
    const eventId = await this.getEventId();
    return {
      db,
      settingsRef: eventCollection(db, eventId, EVENT_CONFIG_COLLECTION).doc(SETTINGS_DOC),
      prizes: eventCollection(db, eventId, RAFFLE_PRIZES_COLLECTION),
      draws: eventCollection(db, eventId, RAFFLE_DRAWS_COLLECTION),
      participants: eventCollection(db, eventId, PARTICIPANTS_COLLECTION),
    };
  }

  async settings(): Promise<Result<RaffleSettings | null, { code: string }>> {
    try {
      const snapshot = await (await this.scope()).settingsRef.get();
      return ok(snapshot.exists ? parseRaffleSettings(snapshot.data()) : null);
    } catch (cause) {
      logServerError("raffle.settings.read", cause);
      return err({ code: "unknown" });
    }
  }

  async saveSettings(settings: RaffleSettings): Promise<Result<void, { code: string }>> {
    try {
      await (await this.scope()).settingsRef.set({ minCredits: settings.minCredits, updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("raffle.settings.save", cause);
      return err({ code: "unknown" });
    }
  }

  async prizes(): Promise<Result<readonly RafflePrize[], { code: string }>> {
    try {
      const snapshot = await (await this.scope()).prizes.get();
      return ok(snapshot.docs.flatMap((doc) => toPrize(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("raffle.prizes.list", cause);
      return err({ code: "unknown" });
    }
  }

  async createPrize(prize: Omit<RafflePrize, "id">): Promise<Result<RafflePrize, { code: string }>> {
    try {
      const ref = (await this.scope()).prizes.doc();
      const { image, ...fields } = prize;
      await ref.create({ ...fields, imagePath: image?.path ?? null, createdAt: new Date() });
      return ok({ ...prize, id: ref.id });
    } catch (cause) {
      logServerError("raffle.prizes.create", cause);
      return err({ code: "unknown" });
    }
  }

  async updatePrize(id: string, patch: Partial<Pick<RafflePrize, "name" | "quantity" | "active" | "image">>): Promise<Result<{ before: RafflePrize; after: RafflePrize } | null, { code: string }>> {
    try {
      const { db, prizes } = await this.scope();
      const ref = prizes.doc(id);
      return await db.runTransaction(async (tx): Promise<Result<{ before: RafflePrize; after: RafflePrize } | null, { code: string }>> => {
        const before = toPrize(id, (await tx.get(ref)).data());
        if (!before) return ok(null);
        // The units already given are read inside the transaction: a draw cannot slip in under a lower quantity.
        if (patch.quantity !== undefined && patch.quantity < before.awarded) return err({ code: "quantity-below-awarded" });
        const { image, ...fields } = patch;
        tx.update(ref, image === undefined ? { ...fields } : { ...fields, imagePath: image?.path ?? null });
        return ok({ before, after: { ...before, ...patch } });
      });
    } catch (cause) {
      logServerError("raffle.prizes.update", cause);
      return err({ code: "unknown" });
    }
  }

  async draws(): Promise<Result<readonly RaffleDraw[], { code: string }>> {
    try {
      const snapshot = await (await this.scope()).draws.get();
      return ok(snapshot.docs.flatMap((doc) => toDraw(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("raffle.draws.list", cause);
      return err({ code: "unknown" });
    }
  }

  async drawsOf(uid: string): Promise<Result<readonly RaffleDraw[], { code: string }>> {
    try {
      const snapshot = await (await this.scope()).draws.where("winnerUid", "==", uid).get();
      return ok(snapshot.docs.flatMap((doc) => toDraw(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("raffle.draws.of", cause);
      return err({ code: "unknown" });
    }
  }

  async draw(
    prizeId: string,
    build: (prize: RafflePrize, draws: readonly RaffleDraw[]) => Result<NewDraw, { code: RaffleErrorCode }>,
  ): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> {
    try {
      const { db, prizes, draws } = await this.scope();
      const prizeRef = prizes.doc(prizeId);
      return await db.runTransaction(async (tx): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> => {
        const [prizeSnapshot, drawsSnapshot] = await Promise.all([tx.get(prizeRef), tx.get(draws)]);
        const prize = prizeSnapshot.exists ? toPrize(prizeId, prizeSnapshot.data()) : null;
        if (!prize) return err({ code: "not-found" });
        const built = build(prize, drawsSnapshot.docs.flatMap((doc) => toDraw(doc.id, doc.data()) ?? []));
        if (!built.ok) return built;

        const number = prize.drawSeq + 1;
        const draw: RaffleDraw = { ...built.value, id: `${prizeId}-${number}`, prizeId, prizeName: prize.name, voided: false };
        const { id, ...stored } = draw;
        tx.create(draws.doc(id), stored);
        tx.update(prizeRef, { awarded: prize.awarded + 1, drawSeq: number });
        return ok({ ...draw, prizeImageUrl: prize.image?.url ?? null });
      });
    } catch (cause) {
      logServerError("raffle.draw", cause);
      return err({ code: "unknown" });
    }
  }

  async voidDraw(drawId: string): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> {
    try {
      const { db, prizes, draws } = await this.scope();
      const drawRef = draws.doc(drawId);
      return await db.runTransaction(async (tx): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> => {
        const draw = toDraw(drawId, (await tx.get(drawRef)).data());
        if (!draw) return err({ code: "not-found" });
        if (draw.voided) return err({ code: "already-voided" });
        const prizeRef = prizes.doc(draw.prizeId);
        const prize = toPrize(draw.prizeId, (await tx.get(prizeRef)).data());
        tx.update(drawRef, { voided: true, voidedAt: new Date() });
        if (prize) tx.update(prizeRef, { awarded: Math.max(0, prize.awarded - 1) });
        return ok({ ...draw, voided: true });
      });
    } catch (cause) {
      logServerError("raffle.void", cause);
      return err({ code: "unknown" });
    }
  }

  /** Every cadet of the edition with their G-Credits earned in it (the raffle's tickets). */
  async entrants(): Promise<Result<readonly Entrant[], { code: string }>> {
    try {
      const snapshot = await (await this.scope()).participants.get();
      return ok(
        snapshot.docs.flatMap((doc) => {
          const data = doc.data();
          if (typeof data.alias !== "string") return [];
          const credits = typeof data.credits === "number" && Number.isFinite(data.credits) && data.credits > 0 ? Math.floor(data.credits) : 0;
          return [{ uid: doc.id, alias: data.alias, squadId: typeof data.squad === "string" && data.squad.length > 0 ? data.squad : null, credits }];
        }),
      );
    } catch (cause) {
      logServerError("raffle.entrants", cause);
      return err({ code: "unknown" });
    }
  }
}
