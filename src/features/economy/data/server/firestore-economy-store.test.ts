import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import { DEFAULT_ECONOMY } from "../../domain/settings";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreEconomyStore } = await import("./firestore-economy-store");

function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const reads = { count: 0 };
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          reads.count += 1;
          return { exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) };
        },
        set: async (data: Record<string, unknown>) => void store.set(`${name}/${id}`, data),
      }),
    })),
  };
  return { db: db as unknown as Firestore, store, reads };
}

describe("FirestoreEconomyStore", () => {
  it("reads nothing saved as no settings, saves and reads them back, from a one-minute cache dropped on save", async () => {
    const clock = { now: 0 };
    const fake = fakeFirestore();
    const store = new FirestoreEconomyStore(() => fake.db, testEventResolver, 60_000, () => clock.now);

    expect(await store.load()).toEqual({ ok: true, value: null });
    await store.load();
    expect(fake.reads.count).toBe(1);

    await store.save({ ...DEFAULT_ECONOMY, talkCredits: 7 });
    expect(fake.store.get("events/e1/config/economy")).toMatchObject({ talkCredits: 7, missionCredits: DEFAULT_ECONOMY.missionCredits });
    expect(await store.load()).toEqual({ ok: true, value: { ...DEFAULT_ECONOMY, talkCredits: 7 } });
    expect(fake.reads.count).toBe(2);
  });

  it("reads settings that break the rules as missing, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = fakeFirestore({ "events/e1/config/economy": { ...DEFAULT_ECONOMY, talkCredits: -5 } });

    expect(await new FirestoreEconomyStore(() => fake.db, testEventResolver).load()).toEqual({ ok: true, value: null });
    expect(log).toHaveBeenCalled();
  });

  it("reports failed reads and writes, and never caches a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreEconomyStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.load()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.load()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.save(DEFAULT_ECONOMY)).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
