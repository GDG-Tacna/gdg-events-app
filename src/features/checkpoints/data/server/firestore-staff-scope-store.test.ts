import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestoreStaffScopeStore } = await import("./firestore-staff-scope-store");

type Doc = Record<string, unknown>;

/** In-memory stand-in for the slice of Firestore the store uses, keyed by plain paths. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
      doc: (id: string) => ({
        get: async () => snapshot(`${name}/${id}`),
        set: async (data: Doc) => void store.set(`${name}/${id}`, data),
        delete: async () => void store.delete(`${name}/${id}`),
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

const storeOver = (fake: ReturnType<typeof fakeFirestore>) => new FirestoreStaffScopeStore(() => fake.db, testEventResolver);

describe("FirestoreStaffScopeStore", () => {
  it("reads no limit for someone without a document, and the stored stations otherwise", async () => {
    const fake = fakeFirestore({ "events/e1/staffScopes/s1": { checkpointIds: ["stand-louis", 7] } });

    expect(await storeOver(fake).read("s2")).toEqual({ ok: true, value: null });
    expect(await storeOver(fake).read("s1")).toEqual({ ok: true, value: ["stand-louis"] });
  });

  it("reads a document without a list as limited to nothing, never as every station", async () => {
    const fake = fakeFirestore({ "events/e1/staffScopes/s1": { updatedBy: "a1" } });

    expect(await storeOver(fake).read("s1")).toEqual({ ok: true, value: [] });
  });

  it("lists every limited staff member of the edition only", async () => {
    const fake = fakeFirestore({
      "events/e1/staffScopes/s1": { checkpointIds: ["stand-louis"] },
      "events/e1/staffScopes/s2": { checkpointIds: ["entrada-norte", "almuerzo"] },
      "events/e0/staffScopes/s3": { checkpointIds: ["stand-old"] },
    });

    expect(await storeOver(fake).list()).toEqual({ ok: true, value: { s1: ["stand-louis"], s2: ["entrada-norte", "almuerzo"] } });
  });

  it("saves a limit with who set it and when, and deletes the document when it is lifted", async () => {
    const fake = fakeFirestore();
    const at = new Date("2026-11-16T15:00:00Z");

    expect(await storeOver(fake).save("s1", ["stand-louis"], { by: "a1", at })).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/staffScopes/s1")).toEqual({ checkpointIds: ["stand-louis"], updatedAt: at, updatedBy: "a1" });

    expect(await storeOver(fake).save("s1", null, { by: "a1", at })).toEqual({ ok: true, value: undefined });
    expect(fake.store.has("events/e1/staffScopes/s1")).toBe(false);
  });

  it("reports a failure as unknown", async () => {
    const broken = new FirestoreStaffScopeStore(() => {
      throw new Error("offline");
    }, testEventResolver);

    expect(await broken.read("s1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.save("s1", null, { by: "a1", at: new Date() })).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
