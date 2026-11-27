import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GLOBAL_BADGES } from "../default-global-badges";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const {
  FirestoreCrossEditionAchievementsReader,
  FirestoreGlobalAwardStore,
  FirestoreGlobalBadgeStore,
} = await import("./firestore-global-achievements");

type Doc = Record<string, unknown>;

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map(Object.entries(initial));

  const queryMatches = (prefix: string, filters: Array<{ field: string; op: string; value: unknown }>) => {
    const matches: Array<{ id: string; data: () => Doc }> = [];
    for (const [path, data] of store.entries()) {
      if (!path.startsWith(`${prefix}/`)) continue;
      const rest = path.slice(prefix.length + 1);
      if (rest.includes("/")) continue;
      const ok = filters.every(({ field, op, value }) => {
        if (op === "==") return data[field] === value;
        if (op === "array-contains") return Array.isArray(data[field]) && data[field].includes(value);
        return false;
      });
      if (ok) matches.push({ id: rest, data: () => data });
    }
    return matches;
  };

  const makeQuery = (prefix: string, filters: Array<{ field: string; op: string; value: unknown }> = []) => ({
    where: (field: string, op: string, value: unknown) => makeQuery(prefix, [...filters, { field, op, value }]),
    limit: (n: number) => ({
      get: async () => {
        const docs = queryMatches(prefix, filters).slice(0, n);
        return { docs, empty: docs.length === 0 };
      },
    }),
    count: () => ({
      get: async () => ({ data: () => ({ count: queryMatches(prefix, filters).length }) }),
    }),
    get: async () => {
      const docs = queryMatches(prefix, filters);
      return { docs, empty: docs.length === 0 };
    },
  });

  const makeCollection = (prefix: string): unknown => ({
    ...makeQuery(prefix),
    doc: (id: string) => {
      const path = `${prefix}/${id}`;
      return {
        path,
        id,
        collection: (sub: string) => makeCollection(`${path}/${sub}`),
        get: async () => ({ id, exists: store.has(path), data: () => store.get(path) }),
        create: async (data: Doc) => {
          if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(path, data);
        },
      };
    },
  });

  const db = {
    collection: (name: string) => makeCollection(name),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        get: async (target: { get?: () => Promise<unknown>; path?: string }) =>
          target.get ? target.get() : { exists: store.has(target.path!), data: () => store.get(target.path!) },
        update: (ref: { path: string }, data: Doc) => {
          store.set(ref.path, { ...store.get(ref.path), ...data });
        },
        delete: (ref: { path: string }) => {
          store.delete(ref.path);
        },
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, store };
}

describe("Firestore global achievements adapters", () => {
  it("stores global badges and records idempotent awards", async () => {
    const fake = fakeFirestore({});
    const badges = new FirestoreGlobalBadgeStore(() => fake.db);
    const awards = new FirestoreGlobalAwardStore(() => fake.db);

    expect(await badges.create(DEFAULT_GLOBAL_BADGES[0])).toEqual({ ok: true, value: undefined });
    expect(await badges.create(DEFAULT_GLOBAL_BADGES[0])).toEqual({ ok: false, error: { code: "already-exists" } });

    const at = new Date("2026-11-27T15:00:00Z");
    expect(await awards.award({ uid: "u1", badgeId: "primer-evento", at })).toEqual({ ok: true, value: { awarded: true } });
    expect(await awards.award({ uid: "u1", badgeId: "primer-evento", at })).toEqual({ ok: true, value: { awarded: false } });
    expect(await badges.delete("primer-evento")).toEqual({ ok: true, value: { kind: "has-awards" } });
  });

  it("aggregates cross-edition progress and builds earned-only finished groups", async () => {
    const at = new Date("2026-11-21T18:00:00Z");
    const fake = fakeFirestore({
      "wallets/u1": { earned: 120, balance: 120 },
      "certificates/GDG-1": { uid: "u1", eventId: "devfest-2026", revokedAt: null },
      "certificates/GDG-REV": { uid: "u1", eventId: "devfest-2025", revokedAt: at },
      "events/devfest-2026/participants/u1": { xp: 400, credits: 80, attendedAt: at },
      "events/devfest-2026/achievementAwards/u1_primer-salto": { uid: "u1", badgeId: "primer-salto", at },
      "events/devfest-2026/contacts/u1_u2": { uids: ["u1", "u2"] },
      "events/devfest-2025/participants/u1": { xp: 200, credits: 40, attendedAt: at },
      "events/devfest-2025/achievementAwards/u1_oyente": { uid: "u1", badgeId: "oyente", at },
    });

    const reader = new FirestoreCrossEditionAchievementsReader(() => fake.db);
    const editions = [
      { id: "devfest-2026", name: "DevFest Tacna 2026", startsAt: new Date("2026-11-21T09:00:00Z") },
      { id: "devfest-2025", name: "DevFest Tacna 2025", startsAt: new Date("2025-11-22T09:00:00Z") },
    ];

    const snap = await reader.readSnapshot("u1", editions);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.progress).toEqual({
      eventsAttended: 2,
      totalCredits: 120,
      totalBadges: 2,
      certificatesEarned: 1,
      totalContacts: 1,
    });

    const groups = await reader.buildFinishedGroups(editions, snap.value.earnedByEdition, {
      activeEventId: "devfest-2026",
      activeEventFinished: true,
    });
    expect(groups.ok).toBe(true);
    if (!groups.ok) return;
    expect(groups.value.map((g) => ({ id: g.eventId, isLive: g.isLive, badges: g.badges.map((b) => b.badge.id) }))).toEqual([
      { id: "devfest-2026", isLive: false, badges: ["primer-salto"] },
      { id: "devfest-2025", isLive: false, badges: ["oyente"] },
    ]);
  });
});
