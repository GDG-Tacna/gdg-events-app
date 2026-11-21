import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreProgressResetter } = await import("./firestore-progress-resetter");

type Doc = Record<string, unknown>;
const NOW = new Date("2026-11-20T15:00:00Z");

/**
 * A stand-in for the slice of Firestore the resetter uses: flat documents by path, `get`, `select().get()`,
 * `where("eventId", "==", x).get()`, a bulk writer (delete, update) and transactions (get, set with merge, update, delete).
 * A field set to the delete marker is removed, like Firestore does.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const ref = (path: string) => ({ path, id: path.split("/").pop() as string });
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop() as string, ref: ref(path), data: () => store.get(path) });
  const apply = (path: string, data: Doc, merge: boolean) => {
    const next = { ...(merge ? (store.get(path) ?? {}) : {}) };
    for (const [key, value] of Object.entries(data)) {
      if (FieldValue.delete().isEqual(value as FieldValue)) delete next[key];
      else next[key] = value;
    }
    store.set(path, next);
  };
  const docsIn = (name: string) => [...store.keys()].filter((key) => key.startsWith(`${name}/`) && key.split("/").length === name.split("/").length + 1);
  const list = (name: string, filter?: (data: Doc) => boolean) => {
    const docs = docsIn(name).filter((path) => (filter ? filter(store.get(path) as Doc) : true)).map(snapshot);
    return { docs, size: docs.length };
  };

  const collection = (name: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    get: async () => list(name),
    select: () => ({ get: async () => list(name) }),
    where: (field: string, _op: string, value: unknown) => ({ get: async () => list(name, (data) => data[field] === value) }),
  });

  const writes = { deleted: [] as string[], updated: [] as string[] };
  const db = {
    collection: withEventScope(collection),
    bulkWriter: () => ({
      delete: (target: { path: string }) => (writes.deleted.push(target.path), store.delete(target.path)),
      update: (target: { path: string }, data: Doc) => (writes.updated.push(target.path), apply(target.path, data, true)),
      close: async () => undefined,
    }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (target: { path: string }) => snapshot(target.path),
        set: (target: { path: string }, data: Doc, options?: { merge?: boolean }) => pending.push(() => apply(target.path, data, options?.merge === true)),
        update: (target: { path: string }, data: Doc) => pending.push(() => apply(target.path, data, true)),
        delete: (target: { path: string }) => pending.push(() => void store.delete(target.path)),
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store, writes };
}

const E = "events/e1";
function world() {
  return fakeFirestore({
    [`${E}/participants/u1`]: { alias: "Nova", squad: "firebase", xp: 120, credits: 5, xpReachedAt: NOW, ticketType: "pro" },
    [`${E}/participants/u2`]: { alias: "Orion", squad: null, xp: 40, credits: 2, xpReachedAt: NOW },
    [`${E}/xpLedger/u1_a`]: { uid: "u1", xp: 100 },
    [`${E}/xpLedger/u2_a`]: { uid: "u2", xp: 40 },
    [`${E}/missionCompletions/u1_m1`]: { uid: "u1" },
    [`${E}/achievementAwards/u1_b1`]: { uid: "u1" },
    [`${E}/minigamePlays/u1_m1`]: { uid: "u1" },
    [`${E}/contactRewards/u1_u2`]: { uid: "u1" },
    [`${E}/checkins/u1_entrance`]: { uid: "u1" },
    [`${E}/contacts/u1_u2`]: { uid: "u1" },
    [`${E}/missions/m1`]: { title: "Misión" },
    [`${E}/squadWallets/firebase`]: { balance: 7, earned: 9, spent: 2 },
    [`${E}/squadLedger/u1_a`]: { squadId: "firebase", amount: 3 },
    [`${E}/squadRedemptions/op1`]: { squadId: "firebase", prizeId: "polera" },
    [`${E}/squadRedemptions/op2`]: { squadId: "firebase", prizeId: "polera" },
    [`${E}/squadRedemptions/op3`]: { squadId: "firebase", prizeId: "gone" },
    [`${E}/squadPrizes/polera`]: { name: "Polera", stock: 3 },
    [`${E}/squadPrizes/sticker`]: { name: "Sticker", stock: null },
    "wallets/u1": { balance: 8, earned: 11, spent: 3 },
    "wallets/u2": { balance: 2, earned: 2, spent: 0 },
    "walletLedger/e1_u1_a": { uid: "u1", eventId: "e1", kind: "earn", amount: 5 },
    "walletLedger/e1_u1_b": { uid: "u1", eventId: "e1", kind: "earn", amount: 1 },
    "walletLedger/e0_u1_old": { uid: "u1", eventId: "e0", kind: "earn", amount: 6 },
    "walletLedger/spend_u1_x": { uid: "u1", kind: "spend", amount: 3 },
    "walletLedger/e1_u2_a": { uid: "u2", eventId: "e1", kind: "earn", amount: 2 },
    "events/e0/participants/u1": { alias: "Nova", xp: 300, credits: 6 },
    "events/e0/xpLedger/u1_a": { uid: "u1", xp: 300 },
  });
}

describe("FirestoreProgressResetter", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("puts every cadet at zero XP and credits, without their moment of reaching XP, and keeps who they are", async () => {
    const fake = world();

    const result = await new FirestoreProgressResetter(() => fake.db, () => NOW).reset("e1");

    expect(result).toMatchObject({ ok: true, value: { cadets: 2 } });
    expect(fake.store.get(`${E}/participants/u1`)).toEqual({ alias: "Nova", squad: "firebase", xp: 0, credits: 0, ticketType: "pro" });
    expect(fake.store.get(`${E}/participants/u2`)).toEqual({ alias: "Orion", squad: null, xp: 0, credits: 0 });
  });

  it("clears what earned the progress, and keeps attendance, contacts, missions and prizes", async () => {
    const fake = world();

    await new FirestoreProgressResetter(() => fake.db, () => NOW).reset("e1");

    for (const gone of ["xpLedger/u1_a", "xpLedger/u2_a", "missionCompletions/u1_m1", "achievementAwards/u1_b1", "minigamePlays/u1_m1", "contactRewards/u1_u2", "squadWallets/firebase", "squadLedger/u1_a", "squadRedemptions/op1", "squadRedemptions/op2", "squadRedemptions/op3"]) {
      expect(fake.store.has(`${E}/${gone}`), gone).toBe(false);
    }
    for (const kept of ["checkins/u1_entrance", "contacts/u1_u2", "missions/m1", "squadPrizes/polera", "squadPrizes/sticker"]) {
      expect(fake.store.has(`${E}/${kept}`), kept).toBe(true);
    }
  });

  it("takes the G-Credits of this edition out of the global wallets and deletes their entries, leaving other editions and spends alone", async () => {
    const fake = world();

    await new FirestoreProgressResetter(() => fake.db, () => NOW).reset("e1");

    expect(fake.store.get("wallets/u1")).toMatchObject({ balance: 2, earned: 5, spent: 3, updatedAt: NOW });
    expect(fake.store.get("wallets/u2")).toMatchObject({ balance: 0, earned: 0 });
    expect(fake.store.has("walletLedger/e1_u1_a")).toBe(false);
    expect(fake.store.has("walletLedger/e1_u1_b")).toBe(false);
    expect(fake.store.has("walletLedger/e1_u2_a")).toBe(false);
    expect(fake.store.has("walletLedger/e0_u1_old")).toBe(true);
    expect(fake.store.has("walletLedger/spend_u1_x")).toBe(true);
    // Another edition's cadets and history are not touched.
    expect(fake.store.get("events/e0/participants/u1")).toEqual({ alias: "Nova", xp: 300, credits: 6 });
    expect(fake.store.has("events/e0/xpLedger/u1_a")).toBe(true);
  });

  it("never leaves a wallet below zero", async () => {
    const fake = fakeFirestore({ "wallets/u1": { balance: 1, earned: 1, spent: 0 }, "walletLedger/e1_u1_a": { uid: "u1", eventId: "e1", kind: "earn", amount: 5 }, "events/e1/participants/u1": { xp: 1, credits: 1 } });

    await new FirestoreProgressResetter(() => fake.db, () => NOW).reset("e1");

    expect(fake.store.get("wallets/u1")).toMatchObject({ balance: 0, earned: 0 });
  });

  it("returns the redeemed prizes to the stock of those that have one, and not to a prize without limit or one that is gone", async () => {
    const fake = world();

    await new FirestoreProgressResetter(() => fake.db, () => NOW).reset("e1");

    expect(fake.store.get(`${E}/squadPrizes/polera`)).toEqual({ name: "Polera", stock: 5 });
    expect(fake.store.get(`${E}/squadPrizes/sticker`)).toEqual({ name: "Sticker", stock: null });
    expect(fake.store.has(`${E}/squadPrizes/gone`)).toBe(false);
  });

  it("can be run again: a second run changes nothing and does not return a prize or charge a wallet twice", async () => {
    const fake = world();
    const resetter = new FirestoreProgressResetter(() => fake.db, () => NOW);
    await resetter.reset("e1");
    const after = JSON.stringify([...fake.store.entries()]);

    const again = await resetter.reset("e1");

    expect(again).toMatchObject({ ok: true, value: { cadets: 2 } });
    expect(JSON.stringify([...fake.store.entries()])).toBe(after);
  });

  it("reports a failure instead of throwing", async () => {
    const broken = { collection: () => { throw new Error("down"); } } as unknown as Firestore;

    expect(await new FirestoreProgressResetter(() => broken).reset("e1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(console.error).toHaveBeenCalled();
  });
});
