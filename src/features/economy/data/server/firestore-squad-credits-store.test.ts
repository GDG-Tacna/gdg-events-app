import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreSquadCreditsStore } = await import("./firestore-squad-credits-store");

type Doc = Record<string, unknown>;
const NOW = new Date("2026-10-24T15:00:00Z");
const PRIZES = "events/e1/squadPrizes";
const WALLETS = "events/e1/squadWallets";

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop(), data: () => store.get(path) });
  const docsOf = (collection: string) =>
    [...store.keys()].filter((path) => path.startsWith(`${collection}/`) && !path.slice(collection.length + 1).includes("/")).map(snapshot);
  const ref = (path: string) => ({
    path,
    get: async () => snapshot(path),
    create: async (data: Doc) => {
      if (store.has(path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      store.set(path, data);
    },
  });
  const collection = (name: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    get: async () => ({ docs: docsOf(name) }),
    orderBy: (field: string, direction: string) => ({
      limit: (count: number) => ({
        get: async () => {
          expect([field, direction]).toEqual(["at", "desc"]);
          const time = (value: unknown) => (value instanceof Date ? value : (value as { toDate: () => Date }).toDate()).getTime();
          const docs = docsOf(name).sort((a, b) => time(b.data()?.at) - time(a.data()?.at));
          return { docs: docs.slice(0, count) };
        },
      }),
    }),
  });
  const db = {
    collection: withEventScope(collection),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      let wrote = false;
      const result = await fn({
        get: async (target: { path: string }) => {
          if (wrote) throw new Error("reads must come before writes");
          return snapshot(target.path);
        },
        create: (target: { path: string }, data: Doc) => {
          wrote = true;
          pending.push(() => {
            if (store.has(target.path)) throw new Error("ALREADY_EXISTS");
            store.set(target.path, data);
          });
        },
        update: (target: { path: string }, data: Doc) => {
          wrote = true;
          pending.push(() => {
            if (!store.has(target.path)) throw new Error("NOT_FOUND");
            store.set(target.path, { ...store.get(target.path), ...data });
          });
        },
        set: (target: { path: string }, data: Doc, options?: { merge?: boolean }) => {
          wrote = true;
          pending.push(() => store.set(target.path, options?.merge ? { ...store.get(target.path), ...data } : data));
        },
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const pizza = { name: "Pizza", description: "Para todos", cost: 300, stock: 2, active: true, order: 0 };

describe("FirestoreSquadCreditsStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreSquadCreditsStore>;

  beforeEach(() => {
    fake = fakeFirestore({
      [`${WALLETS}/angular`]: { balance: 500, earned: 600, spent: 100 },
      [`${WALLETS}/gemini`]: { balance: "corrupt" },
      [`${PRIZES}/pizza`]: pizza,
      [`${PRIZES}/stickers`]: { name: "Stickers", cost: 50, stock: null, active: false, order: 1 },
      [`${PRIZES}/broken`]: { name: "x", cost: -1 },
    });
    store = new FirestoreSquadCreditsStore(() => fake.db, testEventResolver, () => NOW);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reads every wallet and one wallet, with 0 for missing or corrupt numbers", async () => {
    expect(await store.wallets()).toEqual({
      ok: true,
      value: [
        { squadId: "angular", balance: 500, earned: 600, spent: 100 },
        { squadId: "gemini", balance: 0, earned: 0, spent: 0 },
      ],
    });
    expect(await store.wallet("angular")).toEqual({ ok: true, value: { squadId: "angular", balance: 500, earned: 600, spent: 100 } });
    expect(await store.wallet("firebase")).toEqual({ ok: true, value: { squadId: "firebase", balance: 0, earned: 0, spent: 0 } });
  });

  it("adds a bonus once per operation, with its ledger entry", async () => {
    const input = { squadId: "firebase", amount: 120, reason: "Reto", operationId: "op_12345678", actorUid: "admin-1" };

    expect(await store.addBonus(input)).toEqual({ ok: true, value: { added: true, balance: 120 } });
    expect(await store.addBonus(input)).toEqual({ ok: true, value: { added: false, balance: 120 } });
    expect(fake.store.get(`${WALLETS}/firebase`)).toEqual({ balance: 120, earned: 120, spent: 0, updatedAt: NOW });
    expect(fake.store.get("events/e1/squadLedger/bonus_op_12345678")).toEqual({ squadId: "firebase", kind: "bonus", amount: 120, reason: "Reto", actorUid: "admin-1", at: NOW });

    await store.addBonus({ ...input, squadId: "angular", operationId: "op_abcdefgh" });
    expect(fake.store.get(`${WALLETS}/angular`)).toMatchObject({ balance: 620, earned: 720, spent: 100 });
  });

  it("lists the prizes it can offer and logs the ones it cannot", async () => {
    expect(await store.prizes()).toEqual({
      ok: true,
      value: [
        { id: "pizza", ...pizza, image: null },
        { id: "stickers", name: "Stickers", description: "", cost: 50, stock: null, active: false, order: 1, image: null },
      ],
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("creates a prize without its id in the document, and refuses a taken id", async () => {
    const prize = { id: "taza", name: "Taza", description: "", cost: 80, stock: null, active: true, order: 2, image: null };

    expect(await store.createPrize(prize)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get(`${PRIZES}/taza`)).toEqual({ name: "Taza", description: "", cost: 80, stock: null, active: true, order: 2, imagePath: null, createdAt: NOW });
    expect(await store.createPrize(prize)).toEqual({ ok: false, error: { code: "already-exists" } });
  });

  it("updates only the given fields and returns the prize before and after", async () => {
    expect(await store.updatePrize("pizza", { cost: 250, stock: undefined, active: false })).toEqual({
      ok: true,
      value: { before: { id: "pizza", ...pizza, image: null }, after: { id: "pizza", ...pizza, image: null, cost: 250, active: false } },
    });
    expect(fake.store.get(`${PRIZES}/pizza`)).toEqual({ ...pizza, cost: 250, active: false });
    expect(await store.updatePrize("ghost", { active: true })).toEqual({ ok: true, value: null });
    expect(await store.updatePrize("broken", { active: true })).toEqual({ ok: true, value: null });
  });

  it("redeems: debits the cost, decrements the stock and records it, once per operation", async () => {
    const input = { squadId: "angular", prizeId: "pizza", operationId: "op_12345678", actorUid: "admin-1" };

    expect(await store.redeem(input)).toEqual({ ok: true, value: { redeemed: true, balance: 200 } });
    expect(await store.redeem(input)).toEqual({ ok: true, value: { redeemed: false, balance: 200 } });
    expect(fake.store.get(`${WALLETS}/angular`)).toEqual({ balance: 200, earned: 600, spent: 400, updatedAt: NOW });
    expect(fake.store.get(`${PRIZES}/pizza`)?.stock).toBe(1);
    expect(fake.store.get("events/e1/squadRedemptions/op_12345678")).toEqual({ squadId: "angular", prizeId: "pizza", prizeName: "Pizza", cost: 300, actorUid: "admin-1", at: NOW });
  });

  it("redeems an unlimited prize without touching its stock", async () => {
    fake.store.set(`${PRIZES}/stickers`, { name: "Stickers", cost: 50, stock: null, active: true, order: 1 });

    expect(await store.redeem({ squadId: "angular", prizeId: "stickers", operationId: "op_12345678", actorUid: "admin-1" })).toEqual({ ok: true, value: { redeemed: true, balance: 450 } });
    expect(fake.store.get(`${PRIZES}/stickers`)?.stock).toBeNull();
  });

  it("redeems with exactly the balance needed", async () => {
    fake.store.set(`${WALLETS}/angular`, { balance: 300, earned: 300, spent: 0 });
    expect(await store.redeem({ squadId: "angular", prizeId: "pizza", operationId: "op_12345678", actorUid: "admin-1" })).toMatchObject({ ok: true, value: { balance: 0 } });
  });

  it.each([
    ["ghost", "angular", undefined, "not-found"],
    ["broken", "angular", undefined, "not-found"],
    ["stickers", "angular", undefined, "inactive"],
    ["pizza", "angular", 0, "out-of-stock"],
    ["pizza", "gemini", undefined, "insufficient"],
    ["pizza", "firebase", undefined, "insufficient"],
  ])("refuses to redeem %s for %s (stock %s): %s, and writes nothing", async (prizeId, squadId, stock, code) => {
    if (stock !== undefined) fake.store.set(`${PRIZES}/pizza`, { ...pizza, stock });
    const before = new Map(fake.store);

    expect(await store.redeem({ squadId, prizeId, operationId: "op_12345678", actorUid: "admin-1" })).toEqual({ ok: false, error: { code } });
    expect(fake.store).toEqual(before);
  });

  it("lists the latest redemptions first, up to the limit", async () => {
    fake.store.set("events/e1/squadRedemptions/op_1", { squadId: "angular", prizeId: "pizza", prizeName: "Pizza", cost: 300, actorUid: "admin-1", at: new Date("2026-10-24T10:00:00Z") });
    fake.store.set("events/e1/squadRedemptions/op_2", { squadId: "gemini", prizeId: "taza", prizeName: "Taza", cost: 80, actorUid: "admin-2", at: { toDate: () => new Date("2026-10-24T12:00:00Z") } });
    fake.store.set("events/e1/squadRedemptions/op_3", { at: new Date("2026-10-24T08:00:00Z") });

    expect(await store.redemptions(2)).toEqual({
      ok: true,
      value: [
        { id: "op_2", squadId: "gemini", prizeId: "taza", prizeName: "Taza", cost: 80, actorUid: "admin-2", at: new Date("2026-10-24T12:00:00Z") },
        { id: "op_1", squadId: "angular", prizeId: "pizza", prizeName: "Pizza", cost: 300, actorUid: "admin-1", at: new Date("2026-10-24T10:00:00Z") },
      ],
    });
  });

  it("reads a redemption with missing fields as empty values", async () => {
    fake.store.set("events/e1/squadRedemptions/op_3", { at: "nonsense" });
    expect(await store.redemptions(5)).toEqual({ ok: true, value: [{ id: "op_3", squadId: "", prizeId: "", prizeName: "", cost: 0, actorUid: "", at: new Date(0) }] });
  });

  it("reports every failed read and write", async () => {
    const broken = new FirestoreSquadCreditsStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);
    const prize = { id: "taza", name: "Taza", description: "", cost: 80, stock: null, active: true, order: 2, image: null };
    const unknown = { ok: false, error: { code: "unknown" } };

    expect(await broken.wallets()).toEqual(unknown);
    expect(await broken.wallet("angular")).toEqual(unknown);
    expect(await broken.addBonus({ squadId: "angular", amount: 1, reason: "Reto", operationId: "op_12345678", actorUid: "a" })).toEqual(unknown);
    expect(await broken.prizes()).toEqual(unknown);
    expect(await broken.createPrize(prize)).toEqual(unknown);
    expect(await broken.updatePrize("taza", { active: true })).toEqual(unknown);
    expect(await broken.redeem({ squadId: "angular", prizeId: "taza", operationId: "op_12345678", actorUid: "a" })).toEqual(unknown);
    expect(await broken.redemptions(5)).toEqual(unknown);
  });
});
