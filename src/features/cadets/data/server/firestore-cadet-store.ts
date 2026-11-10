import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  ACHIEVEMENT_AWARDS_COLLECTION,
  ALIASES_COLLECTION,
  CHECKINS_COLLECTION,
  CONTACTS_COLLECTION,
  CONTACT_CARDS_COLLECTION,
  CONTACT_REWARDS_COLLECTION,
  MINIGAME_PLAYS_COLLECTION,
  MISSION_COMPLETIONS_COLLECTION,
  PARTICIPANTS_COLLECTION,
  POLLS_COLLECTION,
  POLL_VOTES_COLLECTION,
  SQUAD_LEDGER_COLLECTION,
  SQUAD_WALLETS_COLLECTION,
  WALLETS_COLLECTION,
  WALLET_LEDGER_COLLECTION,
  XP_LEDGER_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { CadetPage, CadetRecord, CadetRemoval, CadetStore, CadetSummary } from "../../domain/manage";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};
const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** A participant document as a cadet, or `null` when it has no alias to show. */
export function toCadet(uid: string, data: Record<string, unknown> | undefined): CadetSummary | null {
  if (!data || typeof data.alias !== "string" || data.alias.trim() === "") return null;
  return {
    uid,
    alias: data.alias,
    squad: typeof data.squad === "string" && data.squad.length > 0 ? data.squad : null,
    xp: whole(data.xp),
    credits: whole(data.credits),
    createdAt: toDate(data.createdAt),
    attendedAt: toDate(data.attendedAt),
    banned: data.banned === true,
  };
}

/** Writes per batch: well under Firestore's 500. */
const BATCH = 400;

/**
 * Firestore adapter (Admin SDK) over the cadets of the active edition: `events/{eventId}/participants` and what hangs
 * from each (alias reservations, check-ins, missions, badges, contacts, votes, ledgers). The list is ordered by the
 * alias key, so one ordered read per page needs no composite index; counts are aggregations, never reads of every
 * document.
 */
export class FirestoreCadetStore implements CadetStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async scope() {
    const db = this.getDb();
    const eventId = await this.getEventId();
    return { db, eventId, collection: (name: Parameters<typeof eventCollection>[2]) => eventCollection(db, eventId, name) };
  }

  async list(query: { search: string; after: string | null; limit: number }): Promise<Result<CadetPage, { code: string }>> {
    try {
      const { collection } = await this.scope();
      const participants = collection(PARTICIPANTS_COLLECTION);
      let ordered = participants.orderBy("aliasLower");
      if (query.search) ordered = ordered.where("aliasLower", ">=", query.search).where("aliasLower", "<=", `${query.search}`);
      if (query.after) ordered = ordered.startAfter(query.after);
      const [page, total] = await Promise.all([ordered.limit(query.limit + 1).get(), participants.count().get()]);

      const docs = page.docs.slice(0, query.limit);
      const cadets = docs.flatMap((doc) => toCadet(doc.id, doc.data()) ?? []);
      const last = docs.at(-1)?.data().aliasLower;
      return ok({ cadets, next: page.docs.length > query.limit && typeof last === "string" ? last : null, total: total.data().count });
    } catch (cause) {
      logServerError("cadets.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async get(uid: string): Promise<Result<CadetRecord | null, { code: string }>> {
    try {
      const { collection } = await this.scope();
      const snapshot = await collection(PARTICIPANTS_COLLECTION).doc(uid).get();
      const cadet = snapshot.exists ? toCadet(uid, snapshot.data()) : null;
      if (!cadet) return ok(null);

      const [checkIns, missions, badges, contacts] = await Promise.all([
        collection(CHECKINS_COLLECTION).where("uid", "==", uid).count().get(),
        collection(MISSION_COMPLETIONS_COLLECTION).where("uid", "==", uid).where("status", "==", "completed").count().get(),
        collection(ACHIEVEMENT_AWARDS_COLLECTION).where("uid", "==", uid).count().get(),
        collection(CONTACTS_COLLECTION).where("uids", "array-contains", uid).count().get(),
      ]);
      const data = snapshot.data() ?? {};
      return ok({
        ...cadet,
        activity: { checkIns: checkIns.data().count, missions: missions.data().count, badges: badges.data().count, contacts: contacts.data().count },
        bannedAt: toDate(data.bannedAt),
        banReason: typeof data.banReason === "string" ? data.banReason : null,
      });
    } catch (cause) {
      logServerError("cadets.store.get", cause);
      return err({ code: "unknown" });
    }
  }

  async rename(uid: string, alias: { display: string; key: string }): Promise<Result<{ before: string } | "taken" | null, { code: string }>> {
    try {
      const { db, collection } = await this.scope();
      const participantRef = collection(PARTICIPANTS_COLLECTION).doc(uid);
      const aliases = collection(ALIASES_COLLECTION);
      return await db.runTransaction(async (tx): Promise<Result<{ before: string } | "taken" | null, { code: string }>> => {
        const participant = await tx.get(participantRef);
        const cadet = participant.exists ? toCadet(uid, participant.data()) : null;
        if (!cadet) return ok(null);
        const currentKey = typeof participant.data()?.aliasLower === "string" ? (participant.data()?.aliasLower as string) : cadet.alias.toLowerCase();

        if (currentKey === alias.key) {
          // The same alias in another casing: its reservation stays.
          tx.update(participantRef, { alias: alias.display, aliasLower: alias.key });
          return ok({ before: cadet.alias });
        }
        const wanted = await tx.get(aliases.doc(alias.key));
        if (wanted.exists && wanted.data()?.uid !== uid) return ok("taken");

        tx.delete(aliases.doc(currentKey));
        tx.set(aliases.doc(alias.key), { uid, createdAt: cadet.createdAt ?? new Date() });
        tx.update(participantRef, { alias: alias.display, aliasLower: alias.key });
        return ok({ before: cadet.alias });
      });
    } catch (cause) {
      logServerError("cadets.store.rename", cause);
      return err({ code: "unknown" });
    }
  }

  async setSquad(uid: string, squad: string | null): Promise<Result<{ before: string | null } | null, { code: string }>> {
    try {
      const { db, collection } = await this.scope();
      const ref = collection(PARTICIPANTS_COLLECTION).doc(uid);
      return await db.runTransaction(async (tx): Promise<Result<{ before: string | null } | null, { code: string }>> => {
        const snapshot = await tx.get(ref);
        const cadet = snapshot.exists ? toCadet(uid, snapshot.data()) : null;
        if (!cadet) return ok(null);
        tx.update(ref, { squad });
        return ok({ before: cadet.squad });
      });
    } catch (cause) {
      logServerError("cadets.store.setSquad", cause);
      return err({ code: "unknown" });
    }
  }

  async setBan(uid: string, ban: { reason: string; by: string; at: Date } | null): Promise<Result<{ wasBanned: boolean } | null, { code: string }>> {
    try {
      const { db, collection } = await this.scope();
      const ref = collection(PARTICIPANTS_COLLECTION).doc(uid);
      return await db.runTransaction(async (tx): Promise<Result<{ wasBanned: boolean } | null, { code: string }>> => {
        const snapshot = await tx.get(ref);
        const cadet = snapshot.exists ? toCadet(uid, snapshot.data()) : null;
        if (!cadet) return ok(null);
        if (ban) tx.update(ref, { banned: true, bannedAt: ban.at, bannedBy: ban.by, banReason: ban.reason });
        else tx.update(ref, { banned: FieldValue.delete(), bannedAt: FieldValue.delete(), bannedBy: FieldValue.delete(), banReason: FieldValue.delete() });
        return ok({ wasBanned: cadet.banned });
      });
    } catch (cause) {
      logServerError("cadets.store.setBan", cause);
      return err({ code: "unknown" });
    }
  }

  async remove(uid: string): Promise<Result<CadetRemoval | null, { code: string }>> {
    try {
      const { db, eventId, collection } = await this.scope();
      const participantRef = collection(PARTICIPANTS_COLLECTION).doc(uid);
      const snapshot = await participantRef.get();
      const cadet = snapshot.exists ? toCadet(uid, snapshot.data()) : null;
      if (!cadet) return ok(null);
      const aliasKey = typeof snapshot.data()?.aliasLower === "string" ? (snapshot.data()?.aliasLower as string) : cadet.alias.toLowerCase();

      const refsOf = async (name: Parameters<typeof eventCollection>[2], field: string, op: "==" | "array-contains" = "==") => (await collection(name).where(field, op, uid).get()).docs.map((doc) => doc.ref);
      const [checkIns, missions, badges, contacts, plays, xpEntries] = await Promise.all([
        refsOf(CHECKINS_COLLECTION, "uid"),
        refsOf(MISSION_COMPLETIONS_COLLECTION, "uid"),
        refsOf(ACHIEVEMENT_AWARDS_COLLECTION, "uid"),
        refsOf(CONTACTS_COLLECTION, "uids", "array-contains"),
        refsOf(MINIGAME_PLAYS_COLLECTION, "uid"),
        refsOf(XP_LEDGER_COLLECTION, "uid"),
      ]);
      const polls = await collection(POLLS_COLLECTION).listDocuments();
      const votes = polls.map((poll) => poll.collection(POLL_VOTES_COLLECTION).doc(uid));

      // What was added to the squad's and the person's wallets comes back out with the entries that put it there.
      await this.takeBackCredits(db, eventId, uid);

      const plain: DocumentReference[] = [
        ...checkIns,
        ...missions,
        ...badges,
        ...contacts,
        ...plays,
        ...xpEntries,
        ...votes,
        collection(CONTACT_CARDS_COLLECTION).doc(uid),
        collection(CONTACT_REWARDS_COLLECTION).doc(uid),
      ];
      for (let at = 0; at < plain.length; at += BATCH) {
        const batch = db.batch();
        for (const ref of plain.slice(at, at + BATCH)) batch.delete(ref);
        await batch.commit();
      }
      // The profile and its alias go last: while they stand, a failed delete can be run again and finds the rest.
      const last = db.batch();
      last.delete(collection(ALIASES_COLLECTION).doc(aliasKey));
      last.delete(participantRef);
      await last.commit();

      return ok({ alias: cadet.alias, checkIns: checkIns.length, missions: missions.length, badges: badges.length, contacts: contacts.length });
    } catch (cause) {
      logServerError("cadets.store.remove", cause);
      return err({ code: "unknown" });
    }
  }

  /**
   * Takes back the G-Credits this edition gave the cadet: their entries in the global wallet's ledger and the squads'
   * ledger are deleted and what they added is subtracted (never below zero), each in one transaction so a retry finds
   * nothing left to subtract twice.
   */
  private async takeBackCredits(db: Firestore, eventId: string, uid: string): Promise<void> {
    const walletEntries = (await db.collection(WALLET_LEDGER_COLLECTION).where("uid", "==", uid).where("eventId", "==", eventId).get()).docs;
    if (walletEntries.length > 0) {
      const walletRef = db.collection(WALLETS_COLLECTION).doc(uid);
      await db.runTransaction(async (tx) => {
        const [wallet, ...entries] = await Promise.all([tx.get(walletRef), ...walletEntries.map((entry) => tx.get(entry.ref))]);
        const earned = entries.filter((entry) => entry.exists && entry.data()?.kind === "earn").reduce((sum, entry) => sum + whole(entry.data()?.amount), 0);
        for (const entry of entries) if (entry.exists) tx.delete(entry.ref);
        if (earned > 0 && wallet.exists) {
          const data = wallet.data() ?? {};
          tx.set(walletRef, { balance: Math.max(0, whole(data.balance) - earned), earned: Math.max(0, whole(data.earned) - earned), updatedAt: new Date() }, { merge: true });
        }
      });
    }

    const squadEntries = (await eventCollection(db, eventId, SQUAD_LEDGER_COLLECTION).where("uid", "==", uid).get()).docs;
    if (squadEntries.length > 0) {
      const squadWallets = eventCollection(db, eventId, SQUAD_WALLETS_COLLECTION);
      await db.runTransaction(async (tx) => {
        const entries = await Promise.all(squadEntries.map((entry) => tx.get(entry.ref)));
        const shares = new Map<string, number>();
        for (const entry of entries) {
          const squadId = entry.data()?.squadId;
          if (entry.exists && typeof squadId === "string") shares.set(squadId, (shares.get(squadId) ?? 0) + whole(entry.data()?.amount));
        }
        const wallets = await Promise.all([...shares.keys()].map(async (squadId) => ({ squadId, wallet: await tx.get(squadWallets.doc(squadId)) })));
        for (const entry of entries) if (entry.exists) tx.delete(entry.ref);
        for (const { squadId, wallet } of wallets) {
          if (!wallet.exists) continue;
          const share = shares.get(squadId) ?? 0;
          const data = wallet.data() ?? {};
          tx.set(squadWallets.doc(squadId), { balance: Math.max(0, whole(data.balance) - share), earned: Math.max(0, whole(data.earned) - share), updatedAt: new Date() }, { merge: true });
        }
      });
    }
  }
}
