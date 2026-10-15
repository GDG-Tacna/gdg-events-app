import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { RankLadder } from "../../domain/rank";

vi.mock("server-only", () => ({}));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { CachedRankStore, FirestoreRankStore } = await import("./firestore-rank-store");

function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>) => void store.set(`${name}/${id}`, data),
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

const RANKS = [
  { id: "cadet", name: "Cadete", minXp: 0, iconPath: null },
  { id: "ace", name: "As", minXp: 50, iconPath: null },
];

describe("FirestoreRankStore", () => {
  it("reads nothing saved as no ladder, saves one and reads it back", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreRankStore(() => fake.db, testEventResolver);

    expect(await store.load()).toEqual(ok(null));
    await store.save(RANKS);

    expect(fake.store.get("events/e1/config/ranks")).toMatchObject({ ranks: RANKS });
    expect(await store.load()).toEqual(ok([{ id: "cadet", name: "Cadete", minXp: 0, level: 1 }, { id: "ace", name: "As", minXp: 50, level: 2 }]));
  });

  it("keeps each icon as its path and rebuilds its address, ignoring another kind's image", async () => {
    const icon = "public/e1/rank/0f8e2c1a-1111-4222-8333-944455551111.webp";
    const fake = fakeFirestore();
    const store = new FirestoreRankStore(() => fake.db, testEventResolver);

    await store.save([{ ...RANKS[0], iconPath: "public/e1/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" }, { ...RANKS[1], iconPath: icon }]);
    const loaded = await store.load();

    expect(loaded.ok && loaded.value?.[1].icon).toEqual({ path: icon, url: `https://cdn/${icon}` });
    expect(loaded.ok && loaded.value?.[0]).not.toHaveProperty("icon");
  });

  it("reads a ladder that breaks the rules as missing, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = fakeFirestore({ "events/e1/config/ranks": { ranks: [{ id: "x", name: "Uno", minXp: 9 }] } });

    expect(await new FirestoreRankStore(() => fake.db, testEventResolver).load()).toEqual(ok(null));
    expect(log).toHaveBeenCalled();
  });

  it("reports failed reads and writes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreRankStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.load()).toEqual(err({ code: "unknown" }));
    expect(await broken.save(RANKS)).toEqual(err({ code: "unknown" }));
  });
});

describe("CachedRankStore", () => {
  it("reads once a minute, never caches a failure, and a save drops the cache", async () => {
    const clock = { now: 0 };
    const inner = {
      load: vi.fn(async (): Promise<Result<RankLadder | null, { code: string }>> => ok(null)),
      save: vi.fn(async (): Promise<Result<void, { code: string }>> => ok(undefined)),
    };
    const cached = new CachedRankStore(inner, 60_000, () => clock.now);

    inner.load.mockResolvedValueOnce(err({ code: "x" }));
    expect(await cached.load()).toEqual(err({ code: "x" }));
    await cached.load();
    clock.now = 59_999;
    await cached.load();
    expect(inner.load).toHaveBeenCalledTimes(2);

    await cached.save(RANKS);
    await cached.load();
    expect(inner.load).toHaveBeenCalledTimes(3);
    expect(inner.save).toHaveBeenCalledWith(RANKS);
  });
});
