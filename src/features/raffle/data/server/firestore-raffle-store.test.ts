import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreRaffleStore } = await import("./firestore-raffle-store");

type Doc = Record<string, unknown>;
const AT = new Date("2026-10-24T23:50:00Z");
const PRIZE = { name: "Polera", quantity: 2, awarded: 0, drawSeq: 0, active: true, order: 0, image: null };
const NEW_DRAW = { winnerUid: "u1", winnerAlias: "Nova", winnerSquadId: "firebase", tickets: 10, totalTickets: 40, entrants: 3, at: AT };

/** Documents, collection reads, auto ids, and transactions that refuse a read after a write. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  let auto = 0;
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const list = (name: string) => ({
    docs: [...store.entries()].filter(([path]) => path.startsWith(`${name}/`) && path.split("/").length === name.split("/").length + 1).map(([path, data]) => ({ id: path.split("/").pop()!, data: () => data })),
  });
  const db = {
    collection: withEventScope((name: string) => ({
      path: name,
      get: async () => list(name),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (op !== "==") throw new Error(`unexpected ${op}`);
          return { docs: list(name).docs.filter((doc) => doc.data()[field] === value) };
        },
      }),
      doc: (id?: string) => {
        const docId = id ?? `auto${++auto}`;
        const path = `${name}/${docId}`;
        return { id: docId, path, get: async () => snapshot(path), set: async (data: Doc) => void store.set(path, data), create: async (data: Doc) => void store.set(path, data) };
      },
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string; doc?: unknown }) => {
          if (pending.length > 0) throw new Error("reads must come before writes");
          return "doc" in ref ? list(ref.path) : snapshot(ref.path);
        },
        create: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreRaffleStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreRaffleStore>;
  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/rafflePrizes/polera": PRIZE });
    store = new FirestoreRaffleStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("saves and reads the settings, none until saved", async () => {
    expect(await store.settings()).toEqual(ok(null));
    await store.saveSettings({ minCredits: 7 });
    expect(await store.settings()).toEqual(ok({ minCredits: 7 }));
  });

  it("creates prizes with their own id and lists them, skipping broken ones", async () => {
    const created = await store.createPrize({ ...PRIZE, name: "Taza", order: 1 });
    fake.store.set("events/e1/rafflePrizes/broken", { name: "x", quantity: 0 });

    expect(created).toEqual(ok({ ...PRIZE, name: "Taza", order: 1, id: "auto1" }));
    expect(await store.prizes()).toMatchObject({ ok: true, value: [{ id: "polera" }, { id: "auto1" }] });
  });

  it("draws the next unit in one go: the numbered draw and the prize's counts", async () => {
    const drawn = await store.draw("polera", (prize, draws) => {
      expect(prize).toEqual({ ...PRIZE, id: "polera" });
      expect(draws).toEqual([]);
      return ok(NEW_DRAW);
    });

    expect(drawn).toEqual(ok({ ...NEW_DRAW, id: "polera-1", prizeId: "polera", prizeName: "Polera", voided: false, prizeImageUrl: null }));
    expect(fake.store.get("events/e1/raffleDraws/polera-1")).toEqual({ ...NEW_DRAW, prizeId: "polera", prizeName: "Polera", voided: false });
    expect(fake.store.get("events/e1/rafflePrizes/polera")).toMatchObject({ awarded: 1, drawSeq: 1 });

    await store.draw("polera", (_prize, draws) => {
      expect(draws.map((d) => d.id)).toEqual(["polera-1"]);
      return ok({ ...NEW_DRAW, winnerUid: "u2" });
    });
    expect(fake.store.has("events/e1/raffleDraws/polera-2")).toBe(true);
  });

  it("keeps a prize's image as its path, and answers its address with a draw without storing it there", async () => {
    const path = "public/e1/raffle-prize/0f8e2c1a-1111-4222-8333-944455551111.webp";
    fake.store.set("events/e1/rafflePrizes/polera", { ...fake.store.get("events/e1/rafflePrizes/polera"), imagePath: path });

    const listed = await store.prizes();
    expect(listed.ok && listed.value.find((prize) => prize.id === "polera")?.image).toEqual({ path, url: `https://cdn/${path}` });

    const drawn = await store.draw("polera", () => ok(NEW_DRAW));
    expect(drawn.ok && drawn.value.prizeImageUrl).toBe(`https://cdn/${path}`);
    expect(fake.store.get("events/e1/raffleDraws/polera-1")).not.toHaveProperty("prizeImageUrl");

    expect(await store.updatePrize("polera", { image: null })).toMatchObject({ ok: true, value: { after: { image: null } } });
    expect(fake.store.get("events/e1/rafflePrizes/polera")).toMatchObject({ imagePath: null });
  });

  it("writes nothing when the draw is refused, or the prize does not exist", async () => {
    expect(await store.draw("polera", () => err({ code: "no-entrants" }))).toEqual(err({ code: "no-entrants" }));
    expect(await store.draw("ghost", () => ok(NEW_DRAW))).toEqual(err({ code: "not-found" }));
    expect(fake.store.get("events/e1/rafflePrizes/polera")).toMatchObject({ awarded: 0, drawSeq: 0 });
  });

  it("voids a draw once and frees its unit, keeping the draw number", async () => {
    await store.draw("polera", () => ok(NEW_DRAW));

    expect(await store.voidDraw("polera-1")).toMatchObject({ ok: true, value: { id: "polera-1", voided: true } });
    expect(fake.store.get("events/e1/raffleDraws/polera-1")).toMatchObject({ voided: true, voidedAt: expect.any(Date) });
    expect(fake.store.get("events/e1/rafflePrizes/polera")).toMatchObject({ awarded: 0, drawSeq: 1 });
    expect(await store.voidDraw("polera-1")).toEqual(err({ code: "already-voided" }));
    expect(await store.voidDraw("ghost")).toEqual(err({ code: "not-found" }));
  });

  it("updates a prize, refusing a quantity below the units given", async () => {
    await store.draw("polera", () => ok(NEW_DRAW));

    expect(await store.updatePrize("polera", { name: "Polera XL" })).toMatchObject({ ok: true, value: { before: { name: "Polera" }, after: { name: "Polera XL" } } });
    expect(await store.updatePrize("polera", { quantity: 0 })).toEqual(err({ code: "quantity-below-awarded" }));
    expect(await store.updatePrize("ghost", { name: "x" })).toEqual(ok(null));
  });

  it("lists the draws with their timestamps, and the entrants with their G-Credits as tickets", async () => {
    fake.store.set("events/e1/raffleDraws/polera-1", { ...NEW_DRAW, prizeId: "polera", prizeName: "Polera", at: { toDate: () => AT } });
    fake.store.set("events/e1/participants/u1", { alias: "Nova", squad: "firebase", credits: 12.9 });
    fake.store.set("events/e1/participants/u2", { alias: "Cero" });
    fake.store.set("events/e1/participants/broken", { credits: 5 });

    expect(await store.draws()).toMatchObject({ ok: true, value: [{ id: "polera-1", at: AT, voided: false }] });
    expect(await store.entrants()).toEqual(
      ok([
        { uid: "u1", alias: "Nova", squadId: "firebase", credits: 12 },
        { uid: "u2", alias: "Cero", squadId: null, credits: 0 },
      ]),
    );
  });

  it("lists only one cadet's draws", async () => {
    await store.draw("polera", () => ok(NEW_DRAW));
    await store.draw("polera", () => ok({ ...NEW_DRAW, winnerUid: "u2" }));

    expect(await store.drawsOf("u2")).toMatchObject({ ok: true, value: [{ id: "polera-2", winnerUid: "u2" }] });
    expect(await store.drawsOf("nobody")).toEqual(ok([]));
  });

  it("reports failed reads and writes", async () => {
    const broken = new FirestoreRaffleStore(() => {
      throw new Error("down");
    }, testEventResolver);

    for (const call of [
      () => broken.settings(),
      () => broken.saveSettings({ minCredits: 1 }),
      () => broken.prizes(),
      () => broken.createPrize(PRIZE),
      () => broken.updatePrize("p", {}),
      () => broken.draws(),
      () => broken.drawsOf("u1"),
      () => broken.draw("p", () => ok(NEW_DRAW)),
      () => broken.voidDraw("p-1"),
      () => broken.entrants(),
    ]) {
      expect(await call()).toEqual(err({ code: "unknown" }));
    }
  });
});
