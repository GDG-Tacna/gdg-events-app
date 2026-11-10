import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => "__delete__" } }));

const { FirestoreCadetStore, toCadet } = await import("./firestore-cadet-store");

type Doc = Record<string, unknown>;

const pick = (data: Doc | undefined, field: string) => data?.[field];

/** A slice of Firestore: documents, equality / range / array queries with order, cursor and limit, counts, transactions, batches. */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path), ref: ref(path) });
  const apply = (path: string, data: Doc) => {
    const next = { ...store.get(path) };
    for (const [key, value] of Object.entries(data)) {
      if (value === "__delete__") delete next[key];
      else next[key] = value;
    }
    store.set(path, next);
  };

  function ref(path: string): Record<string, unknown> {
    return {
      path,
      id: path.split("/").pop()!,
      get: async () => snapshot(path),
      collection: (name: string) => collection(`${path}/${name}`),
    };
  }

  function collection(name: string) {
    const direct = () => [...store.keys()].filter((key) => key.startsWith(`${name}/`) && key.slice(name.length + 1).indexOf("/") === -1);
    const query = (filters: Array<(data: Doc | undefined) => boolean>, order: string | null, cursor: unknown, max: number | null) => {
      const run = () => {
        let paths = direct().filter((path) => filters.every((filter) => filter(store.get(path))));
        if (order) {
          paths = paths.filter((path) => pick(store.get(path), order) !== undefined).sort((a, b) => String(pick(store.get(a), order)).localeCompare(String(pick(store.get(b), order))));
          if (cursor !== null) paths = paths.filter((path) => String(pick(store.get(path), order)) > String(cursor));
        }
        return max === null ? paths : paths.slice(0, max);
      };
      const self = {
        where: (field: string, op: string, value: unknown) =>
          query(
            [
              ...filters,
              (data) => {
                const found = pick(data, field);
                if (op === "==") return found === value;
                if (op === ">=") return typeof found === "string" && found >= String(value);
                if (op === "<=") return typeof found === "string" && found <= String(value);
                if (op === "array-contains") return Array.isArray(found) && found.includes(value);
                throw new Error(`unexpected ${op}`);
              },
            ],
            order,
            cursor,
            max,
          ),
        orderBy: (field: string) => query(filters, field, cursor, max),
        startAfter: (value: unknown) => query(filters, order, value, max),
        limit: (n: number) => query(filters, order, cursor, n),
        get: async () => ({ docs: run().map(snapshot) }),
        count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      };
      return self;
    };
    return {
      ...query([], null, null, null),
      doc: (id: string) => ref(`${name}/${id}`),
      listDocuments: async () => direct().map(ref),
    };
  }

  const db = {
    collection: (name: string) =>
      name === "events"
        ? { doc: (eventId: string) => ({ collection: (child: string) => collection(`events/${eventId}/${child}`) }) }
        : collection(name),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (target: { path: string }) => snapshot(target.path),
        set: (target: { path: string }, data: Doc, options?: { merge?: boolean }) => pending.push(() => (options?.merge ? apply(target.path, data) : void store.set(target.path, data))),
        update: (target: { path: string }, data: Doc) => pending.push(() => apply(target.path, data)),
        delete: (target: { path: string }) => pending.push(() => void store.delete(target.path)),
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
    batch: () => {
      const pending: Array<() => void> = [];
      return {
        delete: (target: { path: string }) => pending.push(() => void store.delete(target.path)),
        commit: async () => pending.forEach((write) => write()),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const CREATED = new Date("2026-11-01T10:00:00Z");
const NOVA: Doc = { alias: "Nova", aliasLower: "nova", role: "attendee", squad: "firebase", xp: 120, credits: 30, createdAt: CREATED, attendedAt: { toDate: () => CREATED } };

describe("toCadet", () => {
  it("reads a participant, its squad, dates and block", () => {
    expect(toCadet("u1", { ...NOVA, banned: true })).toEqual({ uid: "u1", alias: "Nova", squad: "firebase", xp: 120, credits: 30, createdAt: CREATED, attendedAt: CREATED, banned: true });
    expect(toCadet("u2", { alias: "Cero", squad: "", xp: "x" })).toMatchObject({ squad: null, xp: 0, credits: 0, createdAt: null, attendedAt: null, banned: false });
  });

  it("is not a cadet without an alias to show", () => {
    expect(toCadet("u1", undefined)).toBeNull();
    expect(toCadet("u1", { alias: "  " })).toBeNull();
    expect(toCadet("u1", { xp: 5 })).toBeNull();
  });
});

describe("FirestoreCadetStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCadetStore>;

  const aliasDoc = (uid: string) => ({ uid, createdAt: CREATED });
  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/participants/u-nova": NOVA,
      "events/e1/participants/u-mia": { ...NOVA, alias: "Mia", aliasLower: "mia", squad: null, xp: 0 },
      "events/e1/participants/u-milo": { ...NOVA, alias: "Milo", aliasLower: "milo" },
      "events/e1/participants/broken": { xp: 5, aliasLower: "zeta" },
      "events/e1/aliases/nova": aliasDoc("u-nova"),
      "events/e1/aliases/mia": aliasDoc("u-mia"),
      "events/e1/aliases/milo": aliasDoc("u-milo"),
    });
    store = new FirestoreCadetStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("list", () => {
    it("lists the cadets by alias, with how many there are in all, skipping a document with no alias", async () => {
      const listed = await store.list({ search: "", after: null, limit: 25 });

      expect(listed.ok && listed.value.cadets.map((cadet) => cadet.alias)).toEqual(["Mia", "Milo", "Nova"]);
      expect(listed.ok && listed.value.next).toBeNull();
      expect(listed.ok && listed.value.total).toBe(4);
    });

    it("pages with a cursor: asks one more than the page to know whether there is a next one", async () => {
      const first = await store.list({ search: "", after: null, limit: 2 });
      expect(first.ok && first.value.cadets.map((cadet) => cadet.alias)).toEqual(["Mia", "Milo"]);
      expect(first.ok && first.value.next).toBe("milo");

      const second = await store.list({ search: "", after: "milo", limit: 2 });
      expect(second.ok && second.value.cadets.map((cadet) => cadet.alias)).toEqual(["Nova"]);
      expect(second.ok && second.value.next).toBeNull();
    });

    it("keeps only the aliases that start with the search", async () => {
      const listed = await store.list({ search: "mi", after: null, limit: 25 });

      expect(listed.ok && listed.value.cadets.map((cadet) => cadet.alias)).toEqual(["Mia", "Milo"]);
    });
  });

  describe("get", () => {
    it("reads a cadet with what they did in the edition, as counts, and why they are blocked", async () => {
      fake.store.set("events/e1/participants/u-nova", { ...NOVA, banned: true, bannedAt: CREATED, banReason: "Spam" });
      fake.store.set("events/e1/checkins/u-nova_a", { uid: "u-nova" });
      fake.store.set("events/e1/checkins/u-nova_b", { uid: "u-nova" });
      fake.store.set("events/e1/checkins/u-mia_a", { uid: "u-mia" });
      fake.store.set("events/e1/missionCompletions/u-nova_m1", { uid: "u-nova", status: "completed" });
      fake.store.set("events/e1/missionCompletions/u-nova_m2", { uid: "u-nova", status: "failed" });
      fake.store.set("events/e1/achievementAwards/u-nova_b1", { uid: "u-nova" });
      fake.store.set("events/e1/contacts/u-mia_u-nova", { uids: ["u-mia", "u-nova"] });

      const found = await store.get("u-nova");

      expect(found.ok && found.value).toMatchObject({
        alias: "Nova",
        banned: true,
        bannedAt: CREATED,
        banReason: "Spam",
        activity: { checkIns: 2, missions: 1, badges: 1, contacts: 1 },
      });
    });

    it("answers null for a missing cadet or a document with no alias", async () => {
      expect(await store.get("ghost")).toEqual({ ok: true, value: null });
      expect(await store.get("broken")).toEqual({ ok: true, value: null });
    });
  });

  describe("rename", () => {
    it("moves the alias and its reservation in one go", async () => {
      expect(await store.rename("u-nova", { display: "Estrella", key: "estrella" })).toEqual({ ok: true, value: { before: "Nova" } });

      expect(fake.store.get("events/e1/participants/u-nova")).toMatchObject({ alias: "Estrella", aliasLower: "estrella" });
      expect(fake.store.has("events/e1/aliases/nova")).toBe(false);
      expect(fake.store.get("events/e1/aliases/estrella")).toMatchObject({ uid: "u-nova" });
    });

    it("keeps the reservation when only the casing changes", async () => {
      expect(await store.rename("u-nova", { display: "NOVA", key: "nova" })).toEqual({ ok: true, value: { before: "Nova" } });

      expect(fake.store.get("events/e1/participants/u-nova")).toMatchObject({ alias: "NOVA", aliasLower: "nova" });
      expect(fake.store.get("events/e1/aliases/nova")).toMatchObject({ uid: "u-nova" });
    });

    it("refuses an alias another cadet holds, changing nothing", async () => {
      expect(await store.rename("u-nova", { display: "Mia", key: "mia" })).toEqual({ ok: true, value: "taken" });

      expect(fake.store.get("events/e1/participants/u-nova")).toMatchObject({ alias: "Nova" });
      expect(fake.store.get("events/e1/aliases/mia")).toMatchObject({ uid: "u-mia" });
    });

    it("takes back a reservation the same cadet already held, and answers null for a missing cadet", async () => {
      fake.store.set("events/e1/aliases/luna", aliasDoc("u-nova"));

      expect(await store.rename("u-nova", { display: "Luna", key: "luna" })).toEqual({ ok: true, value: { before: "Nova" } });
      expect(await store.rename("ghost", { display: "Luna", key: "luna" })).toEqual({ ok: true, value: null });
    });
  });

  describe("setSquad and setBan", () => {
    it("changes the squad, reporting the one they had", async () => {
      expect(await store.setSquad("u-nova", "angular")).toEqual({ ok: true, value: { before: "firebase" } });
      expect(fake.store.get("events/e1/participants/u-nova")?.squad).toBe("angular");
      expect(await store.setSquad("u-nova", null)).toEqual({ ok: true, value: { before: "angular" } });
      expect(fake.store.get("events/e1/participants/u-nova")?.squad).toBeNull();
      expect(await store.setSquad("ghost", null)).toEqual({ ok: true, value: null });
    });

    it("marks a block with its reason and clears it, reporting whether they were blocked", async () => {
      const at = new Date("2026-11-20T00:00:00Z");

      expect(await store.setBan("u-nova", { reason: "Spam", by: "admin-1", at })).toEqual({ ok: true, value: { wasBanned: false } });
      expect(fake.store.get("events/e1/participants/u-nova")).toMatchObject({ banned: true, bannedAt: at, bannedBy: "admin-1", banReason: "Spam" });

      expect(await store.setBan("u-nova", null)).toEqual({ ok: true, value: { wasBanned: true } });
      const cleared = fake.store.get("events/e1/participants/u-nova")!;
      expect(cleared).not.toHaveProperty("banned");
      expect(cleared).not.toHaveProperty("banReason");
      expect(cleared.alias).toBe("Nova");
      expect(await store.setBan("ghost", null)).toEqual({ ok: true, value: null });
    });
  });

  describe("remove", () => {
    beforeEach(() => {
      const mine = (name: string, data: Doc = {}) => fake.store.set(`events/e1/${name}`, { uid: "u-nova", ...data });
      const others = (name: string, data: Doc = {}) => fake.store.set(`events/e1/${name}`, { uid: "u-mia", ...data });
      mine("checkins/u-nova_a");
      mine("checkins/u-nova_b");
      others("checkins/u-mia_a");
      mine("missionCompletions/u-nova_m1", { status: "completed" });
      mine("xpLedger/u-nova_mission:m1", { xp: 50 });
      mine("achievementAwards/u-nova_b1");
      mine("minigamePlays/u-nova_m1");
      fake.store.set("events/e1/contacts/u-mia_u-nova", { uids: ["u-mia", "u-nova"] });
      fake.store.set("events/e1/contacts/u-mia_u-milo", { uids: ["u-mia", "u-milo"] });
      fake.store.set("events/e1/contactCards/u-nova", { web: "https://x.example" });
      fake.store.set("events/e1/contactRewards/u-nova", { slots: [] });
      fake.store.set("events/e1/polls/poll-1", { question: "¿?" });
      fake.store.set("events/e1/polls/poll-1/votes/u-nova", { option: 0 });
      fake.store.set("events/e1/polls/poll-1/votes/u-mia", { option: 1 });
      // The global wallet and the squad's, with what this edition and another gave.
      fake.store.set("wallets/u-nova", { balance: 100, earned: 130, spent: 30 });
      fake.store.set("walletLedger/e1_u-nova_a", { uid: "u-nova", eventId: "e1", kind: "earn", amount: 30 });
      fake.store.set("walletLedger/e1_u-nova_b", { uid: "u-nova", eventId: "e1", kind: "earn", amount: 20 });
      fake.store.set("walletLedger/e0_u-nova_a", { uid: "u-nova", eventId: "e0", kind: "earn", amount: 80 });
      fake.store.set("walletLedger/spend_u-nova_x", { uid: "u-nova", kind: "spend", amount: 30 });
      fake.store.set("events/e1/squadWallets/firebase", { balance: 40, earned: 60, spent: 20 });
      fake.store.set("events/e1/squadLedger/u-nova_mission:m1", { squadId: "firebase", uid: "u-nova", kind: "contribution", amount: 15 });
      fake.store.set("events/e1/squadLedger/u-mia_mission:m1", { squadId: "firebase", uid: "u-mia", kind: "contribution", amount: 9 });
    });

    it("removes the profile, its alias and everything the cadet did in the edition, and says how much", async () => {
      const removed = await store.remove("u-nova");

      expect(removed).toEqual({ ok: true, value: { alias: "Nova", checkIns: 2, missions: 1, badges: 1, contacts: 1 } });
      for (const path of [
        "events/e1/participants/u-nova",
        "events/e1/aliases/nova",
        "events/e1/checkins/u-nova_a",
        "events/e1/checkins/u-nova_b",
        "events/e1/missionCompletions/u-nova_m1",
        "events/e1/xpLedger/u-nova_mission:m1",
        "events/e1/achievementAwards/u-nova_b1",
        "events/e1/minigamePlays/u-nova_m1",
        "events/e1/contacts/u-mia_u-nova",
        "events/e1/contactCards/u-nova",
        "events/e1/contactRewards/u-nova",
        "events/e1/polls/poll-1/votes/u-nova",
      ]) {
        expect(fake.store.has(path), path).toBe(false);
      }
    });

    it("leaves other cadets, their alias, their contacts and votes, and the poll itself", async () => {
      await store.remove("u-nova");

      for (const path of [
        "events/e1/participants/u-mia",
        "events/e1/aliases/mia",
        "events/e1/checkins/u-mia_a",
        "events/e1/contacts/u-mia_u-milo",
        "events/e1/polls/poll-1",
        "events/e1/polls/poll-1/votes/u-mia",
      ]) {
        expect(fake.store.has(path), path).toBe(true);
      }
    });

    it("takes back the G-Credits this edition gave, from the wallet and from the squad's, never below zero", async () => {
      await store.remove("u-nova");

      // 50 earned here (30 + 20) come out of 100 / 130; the other edition's 80 and the spend entry stay.
      expect(fake.store.get("wallets/u-nova")).toMatchObject({ balance: 50, earned: 80, spent: 30 });
      expect(fake.store.has("walletLedger/e1_u-nova_a")).toBe(false);
      expect(fake.store.has("walletLedger/e1_u-nova_b")).toBe(false);
      expect(fake.store.has("walletLedger/e0_u-nova_a")).toBe(true);
      expect(fake.store.has("walletLedger/spend_u-nova_x")).toBe(true);
      // The squad gets back the 15 this cadet's earnings added, not the 9 of the other member.
      expect(fake.store.get("events/e1/squadWallets/firebase")).toMatchObject({ balance: 25, earned: 45, spent: 20 });
      expect(fake.store.has("events/e1/squadLedger/u-nova_mission:m1")).toBe(false);
      expect(fake.store.has("events/e1/squadLedger/u-mia_mission:m1")).toBe(true);
    });

    it("never takes a balance below zero", async () => {
      fake.store.set("wallets/u-nova", { balance: 10, earned: 20, spent: 0 });
      fake.store.set("events/e1/squadWallets/firebase", { balance: 5, earned: 5, spent: 0 });

      await store.remove("u-nova");

      expect(fake.store.get("wallets/u-nova")).toMatchObject({ balance: 0, earned: 0 });
      expect(fake.store.get("events/e1/squadWallets/firebase")).toMatchObject({ balance: 0, earned: 0 });
    });

    it("answers null for a missing cadet or one with no alias, deleting nothing", async () => {
      const before = fake.store.size;

      expect(await store.remove("ghost")).toEqual({ ok: true, value: null });
      expect(await store.remove("broken")).toEqual({ ok: true, value: null });
      expect(fake.store.size).toBe(before);
    });

    it("can be run again after a failure: nothing is subtracted twice", async () => {
      await store.remove("u-nova");
      // The profile is gone, so a second run finds no cadet and changes nothing more.
      expect(await store.remove("u-nova")).toEqual({ ok: true, value: null });
      expect(fake.store.get("wallets/u-nova")).toMatchObject({ balance: 50, earned: 80 });
    });
  });

  it("turns unexpected failures into an unknown error", async () => {
    const broken = new FirestoreCadetStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.list({ search: "", after: null, limit: 25 })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.get("u-nova")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.rename("u-nova", { display: "X", key: "x" })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.setSquad("u-nova", null)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.setBan("u-nova", null)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.remove("u-nova")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
