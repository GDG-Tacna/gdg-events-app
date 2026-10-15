import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreXpLedger } = await import("./firestore-xp-ledger");

type Doc = Record<string, unknown>;
const NOW = new Date("2026-10-24T15:00:00Z");

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
  const ref = (path: string) => ({ path, get: async () => snapshot(path) });
  const db = {
    collection: withEventScope((name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (target: { path: string }) => snapshot(target.path),
        create: (target: { path: string }, data: Doc) =>
          pending.push(() => {
            if (store.has(target.path)) throw new Error("ALREADY_EXISTS");
            store.set(target.path, data);
          }),
        update: (target: { path: string }, data: Doc) => pending.push(() => store.set(target.path, { ...store.get(target.path), ...data })),
        set: (target: { path: string }, data: Doc) => pending.push(() => store.set(target.path, { ...store.get(target.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreXpLedger", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let ledger: InstanceType<typeof FirestoreXpLedger>;

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/participants/u1": { alias: "nova", xp: 100, credits: 20 },
      "events/e1/participants/u2": { alias: "sin-nada" },
      "wallets/u1": { balance: 300, earned: 300, spent: 0 },
    });
    ledger = new FirestoreXpLedger(() => fake.db, testEventResolver, () => NOW);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("writes the edition entry, adds XP and credits to this edition, and credits to the global wallet with its own entry", async () => {
    expect(await ledger.grant({ uid: "u1", source: "mission:ai-quiz", xp: 40, credits: 5 })).toEqual({ ok: true, value: { granted: true, total: 140, balance: 305 } });

    expect(fake.store.get("events/e1/xpLedger/u1_mission:ai-quiz")).toEqual({ uid: "u1", source: "mission:ai-quiz", xp: 40, credits: 5, at: NOW });
    expect(fake.store.get("events/e1/participants/u1")).toEqual({ alias: "nova", xp: 140, credits: 25, xpReachedAt: NOW });
    expect(fake.store.get("wallets/u1")).toEqual({ balance: 305, earned: 305, spent: 0, updatedAt: NOW });
    expect(fake.store.get("walletLedger/e1_u1_mission:ai-quiz")).toEqual({ uid: "u1", eventId: "e1", kind: "earn", source: "mission:ai-quiz", amount: 5, at: NOW });
  });

  it("pays each source once: a repeated reward changes nothing", async () => {
    await ledger.grant({ uid: "u1", source: "mission:ai-quiz", xp: 40, credits: 5 });

    expect(await ledger.grant({ uid: "u1", source: "mission:ai-quiz", xp: 40, credits: 5 })).toEqual({ ok: true, value: { granted: false, total: 140, balance: 305 } });
    expect(fake.store.get("events/e1/participants/u1")).toMatchObject({ xp: 140, credits: 25 });
    expect(fake.store.get("wallets/u1")?.balance).toBe(305);
  });

  it("pays credits only (a talk) and XP only (credits switched off), and opens a wallet for a first earner", async () => {
    expect(await ledger.grant({ uid: "u2", source: "talk:keynote", xp: 0, credits: 10 })).toEqual({ ok: true, value: { granted: true, total: 0, balance: 10 } });
    // Credits alone do not move the XP, so they do not move when it was reached.
    expect(fake.store.get("events/e1/participants/u2")).not.toHaveProperty("xpReachedAt");
    expect(fake.store.get("wallets/u2")).toEqual({ balance: 10, earned: 10, spent: 0, updatedAt: NOW });

    await ledger.grant({ uid: "u2", source: "mission:x1", xp: 30, credits: 0 });
    expect(fake.store.get("events/e1/participants/u2")).toMatchObject({ xp: 30, credits: 10 });
    expect(fake.store.has("walletLedger/e1_u2_mission:x1")).toBe(false);
  });

  it("keeps the mission and its mini-game bonus as separate sources", async () => {
    await ledger.grant({ uid: "u1", source: "mission:ai-quiz", xp: 40, credits: 0 });
    await ledger.grant({ uid: "u1", source: "minigame:ai-quiz", xp: 40, credits: 0 });

    expect(fake.store.get("events/e1/participants/u1")?.xp).toBe(180);
  });

  it("refuses an attendee without a profile in this edition, and writes nothing", async () => {
    expect(await ledger.grant({ uid: "ghost", source: "mission:x1", xp: 30, credits: 5 })).toEqual({ ok: false, error: { code: "not-registered" } });
    expect(fake.store.has("wallets/ghost")).toBe(false);
  });

  it.each([
    [0, 0],
    [-5, 1],
    [2.5, 0],
    [10_001, 0],
    [0, 10_001],
  ])("refuses XP %s and credits %s without touching the database", async (xp, credits) => {
    const untouched = new FirestoreXpLedger(() => { throw new Error("no db"); }, testEventResolver);

    expect(await untouched.grant({ uid: "u1", source: "mission:x1", xp, credits })).toEqual({ ok: false, error: { code: "invalid-amount" } });
  });

  describe("squad contribution", () => {
    const withRatio = (ratio: number) => {
      const read = vi.fn(async () => ratio);
      return { read, ledger: new FirestoreXpLedger(() => fake.db, testEventResolver, () => NOW, read) };
    };

    beforeEach(() => {
      fake.store.set("events/e1/participants/u3", { alias: "orion", xp: 0, credits: 0, squad: "angular" });
      fake.store.set("events/e1/squadWallets/angular", { balance: 40, earned: 50, spent: 10 });
    });

    it("gives the member's squad its share of the credits, with its own entry, once per source", async () => {
      const { ledger } = withRatio(0.5);

      await ledger.grant({ uid: "u3", source: "mission:ai-quiz", xp: 40, credits: 15 });
      await ledger.grant({ uid: "u3", source: "mission:ai-quiz", xp: 40, credits: 15 });

      expect(fake.store.get("events/e1/squadWallets/angular")).toEqual({ balance: 47, earned: 57, spent: 10, updatedAt: NOW });
      expect(fake.store.get("events/e1/squadLedger/u3_mission:ai-quiz")).toEqual({ squadId: "angular", uid: "u3", source: "mission:ai-quiz", kind: "contribution", amount: 7, at: NOW });
      expect(fake.store.get("wallets/u3")?.balance).toBe(15);
    });

    it("opens the squad wallet on its first contribution", async () => {
      fake.store.delete("events/e1/squadWallets/angular");
      await withRatio(1).ledger.grant({ uid: "u3", source: "talk:keynote", xp: 0, credits: 10 });

      expect(fake.store.get("events/e1/squadWallets/angular")).toEqual({ balance: 10, earned: 10, spent: 0, updatedAt: NOW });
    });

    it("gives nothing with squad credits off, without credits, without a squad, or when the share rounds to 0", async () => {
      const off = withRatio(0);
      await off.ledger.grant({ uid: "u3", source: "mission:x1", xp: 10, credits: 10 });

      const xpOnly = withRatio(1);
      await xpOnly.ledger.grant({ uid: "u3", source: "mission:x2", xp: 10, credits: 0 });
      expect(xpOnly.read).not.toHaveBeenCalled();

      await withRatio(1).ledger.grant({ uid: "u1", source: "mission:x3", xp: 10, credits: 10 });
      fake.store.set("events/e1/participants/u4", { alias: "vega", squad: "" });
      await withRatio(1).ledger.grant({ uid: "u4", source: "mission:x4", xp: 10, credits: 10 });
      await withRatio(0.05).ledger.grant({ uid: "u3", source: "mission:x5", xp: 10, credits: 10 });

      expect(fake.store.get("events/e1/squadWallets/angular")).toEqual({ balance: 40, earned: 50, spent: 10 });
      expect([...fake.store.keys()].some((path) => path.startsWith("events/e1/squadLedger/"))).toBe(false);
      expect(fake.store.has("events/e1/squadWallets/")).toBe(false);
    });

    it("pays the member even when their squad gets nothing", async () => {
      expect(await withRatio(0).ledger.grant({ uid: "u3", source: "mission:x1", xp: 10, credits: 10 })).toEqual({ ok: true, value: { granted: true, total: 10, balance: 10 } });
    });

    it("fails the whole reward when the ratio cannot be read", async () => {
      const failing = new FirestoreXpLedger(() => fake.db, testEventResolver, () => NOW, async () => { throw new Error("config offline"); });

      expect(await failing.grant({ uid: "u3", source: "mission:x1", xp: 10, credits: 10 })).toEqual({ ok: false, error: { code: "unknown" } });
      expect(fake.store.get("events/e1/participants/u3")).toMatchObject({ xp: 0, credits: 0 });
    });
  });

  it("spends from the wallet once per operation and never below zero", async () => {
    expect(await ledger.spend({ uid: "u1", operationId: "order-1", amount: 120, reason: "Polera" })).toEqual({ ok: true, value: { charged: true, balance: 180 } });
    expect(await ledger.spend({ uid: "u1", operationId: "order-1", amount: 120, reason: "Polera" })).toEqual({ ok: true, value: { charged: false, balance: 180 } });
    expect(fake.store.get("wallets/u1")).toMatchObject({ balance: 180, spent: 120 });
    expect(fake.store.get("walletLedger/spend_u1_order-1")).toEqual({ uid: "u1", kind: "spend", operationId: "order-1", amount: 120, reason: "Polera", at: NOW });

    expect(await ledger.spend({ uid: "u1", operationId: "order-2", amount: 181, reason: "Taza" })).toEqual({ ok: false, error: { code: "insufficient" } });
    expect(await ledger.spend({ uid: "u2", operationId: "order-3", amount: 1, reason: "Sticker" })).toEqual({ ok: false, error: { code: "insufficient" } });
    expect(await ledger.spend({ uid: "u1", operationId: "bad id/x", amount: 1, reason: "x" })).toEqual({ ok: false, error: { code: "invalid-amount" } });
    expect(await ledger.spend({ uid: "u1", operationId: "order-4", amount: 0, reason: "x" })).toEqual({ ok: false, error: { code: "invalid-amount" } });
  });

  it("reads a person's balance, 0 without a wallet", async () => {
    expect(await ledger.balanceOf("u1")).toEqual({ ok: true, value: 300 });
    expect(await ledger.balanceOf("nobody")).toEqual({ ok: true, value: 0 });
  });

  it("reports failed transactions and reads", async () => {
    const broken = new FirestoreXpLedger(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.grant({ uid: "u1", source: "mission:x1", xp: 10, credits: 0 })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.spend({ uid: "u1", operationId: "op-1", amount: 1, reason: "x" })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.balanceOf("u1")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
