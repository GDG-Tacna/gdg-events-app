import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestorePermissionStore } = await import("./firestore-permission-store");
const { DEFAULT_PERMISSIONS } = await import("../../domain/permissions");

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

describe("FirestorePermissionStore", () => {
  it("reads the defaults for a new edition, and the stored permissions otherwise", async () => {
    expect(await new FirestorePermissionStore(() => fakeFirestore().db, testEventResolver).read()).toEqual({ ok: true, value: DEFAULT_PERMISSIONS });
    const stored = fakeFirestore({ "events/e1/config/permissions": { organizer: { raffle: "none" }, staffStations: ["stand"] } });
    const read = await new FirestorePermissionStore(() => stored.db, testEventResolver).read();
    expect(read.ok && read.value.organizer.raffle).toBe("none");
    expect(read.ok && read.value.staffStations).toEqual(["stand"]);
  });

  it("saves them in the edition's config, and reports a failure", async () => {
    const fake = fakeFirestore();

    expect(await new FirestorePermissionStore(() => fake.db, testEventResolver).save(DEFAULT_PERMISSIONS)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/config/permissions")).toMatchObject({ staffStations: ["entrance", "catering", "stand"], updatedAt: expect.any(Date) });

    const broken = new FirestorePermissionStore(() => {
      throw new Error("offline");
    }, testEventResolver);
    expect(await broken.read()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
