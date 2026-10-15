import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestoreModuleStore } = await import("./firestore-module-store");

function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: () => store.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>) => void store.set(`${name}/${id}`, data),
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreModuleStore", () => {
  it("reads nothing off for a new edition, and the stored list otherwise", async () => {
    expect(await new FirestoreModuleStore(() => fakeFirestore().db, testEventResolver).readOff()).toEqual({ ok: true, value: [] });
    const stored = fakeFirestore({ "events/e1/config/modules": { off: ["raffle", "unknown"] } });
    expect(await new FirestoreModuleStore(() => stored.db, testEventResolver).readOff()).toEqual({ ok: true, value: ["raffle"] });
  });

  it("saves the list in the edition's config", async () => {
    const fake = fakeFirestore();

    expect(await new FirestoreModuleStore(() => fake.db, testEventResolver).saveOff(["network"])).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/config/modules")).toEqual({ off: ["network"], updatedAt: expect.any(Date) });
  });

  it("reports a failure", async () => {
    const broken = new FirestoreModuleStore(() => {
      throw new Error("offline");
    }, testEventResolver);

    expect(await broken.readOff()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.saveOff([])).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
