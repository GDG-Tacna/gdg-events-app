import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestoreEditionCopier } = await import("./firestore-edition-copier");

type Doc = Record<string, unknown>;
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const commits: number[] = [];
  const docRef = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    collection: (child: string) => collectionRef(`${path}/${child}`),
  });
  const collectionRef = (name: string) => ({
    doc: (id: string) => docRef(`${name}/${id}`),
    get: async () => ({
      docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`) && key.split("/").length === name.split("/").length + 1).map((key) => ({ id: key.split("/").pop()!, data: () => store.get(key)! })),
    }),
  });
  const db = {
    collection: withEventScope(collectionRef),
    batch: () => {
      const pending: Array<[string, Doc]> = [];
      return {
        create: (ref: { path: string }, data: Doc) => pending.push([ref.path, data]),
        commit: async () => {
          for (const [path] of pending) if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
          pending.forEach(([path, data]) => store.set(path, data));
          commits.push(pending.length);
        },
      };
    },
  };
  // `eventDocument` uses db.collection("events").doc(id): give it the document form with sub-collections.
  const events = { doc: (id: string) => docRef(`events/${id}`) };
  const full = { ...db, collection: (name: string) => (name === "events" ? { ...events, ...db.collection(name) } : db.collection(name)) };
  return { db: full as unknown as Firestore, store, commits };
}

const SOURCE = {
  "events/e1/checkpoints/entrada": { kind: "entrance", name: "Entrada", createdAt: new Date(0) },
  "events/e1/checkpoints/keynote": { kind: "talk", name: "Keynote" },
  "events/e1/quadrants/ai": { name: "AI", order: 1 },
  "events/e1/venue/map": { width: 10, backgroundPath: null },
  "events/e1/config/ranks": { ranks: [], updatedAt: new Date(0) },
};

describe("FirestoreEditionCopier", () => {
  it("reads each part from where it lives, telling talks and checkpoints apart, without their own timestamps", async () => {
    const copier = new FirestoreEditionCopier(() => fakeFirestore(SOURCE).db);

    expect(await copier.read("e1", "checkpoints")).toEqual({ ok: true, value: [{ path: "checkpoints/entrada", data: { kind: "entrance", name: "Entrada" } }] });
    expect(await copier.read("e1", "talks")).toEqual({ ok: true, value: [{ path: "checkpoints/keynote", data: { kind: "talk", name: "Keynote" } }] });
    expect(await copier.read("e1", "map")).toEqual({
      ok: true,
      value: [
        { path: "quadrants/ai", data: { name: "AI", order: 1 } },
        { path: "venue/map", data: { width: 10, backgroundPath: null } },
      ],
    });
    expect(await copier.read("e1", "ranks")).toEqual({ ok: true, value: [{ path: "config/ranks", data: { ranks: [] } }] });
  });

  it("knows whether an edition still has nothing of a part", async () => {
    const copier = new FirestoreEditionCopier(() => fakeFirestore(SOURCE).db);

    expect(await copier.isEmpty("e1", "talks")).toEqual({ ok: true, value: false });
    expect(await copier.isEmpty("e1", "missions")).toEqual({ ok: true, value: true });
    expect(await copier.isEmpty("e2", "map")).toEqual({ ok: true, value: true });
  });

  it("creates the documents in the destination with the same ids, a new date and where they came from", async () => {
    const fake = fakeFirestore({});
    const copier = new FirestoreEditionCopier(() => fake.db);

    expect(await copier.write("e2", [{ path: "missions/ai-quiz", data: { title: "Quiz" } }, { path: "config/ranks", data: { ranks: [] } }], "e1")).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e2/missions/ai-quiz")).toEqual({ title: "Quiz", createdAt: expect.any(Date), copiedFrom: "e1" });
    expect(fake.store.get("events/e2/config/ranks")).toMatchObject({ ranks: [], copiedFrom: "e1" });
  });

  it("writes in batches Firestore accepts, and reports a failure (never overwriting)", async () => {
    const fake = fakeFirestore({ "events/e2/squads/s5": { name: "taken" } });
    const copier = new FirestoreEditionCopier(() => fake.db);
    const many = Array.from({ length: 460 }, (_, index) => ({ path: `squads/s${index + 10}`, data: {} }));

    expect(await copier.write("e2", many, "e1")).toEqual({ ok: true, value: undefined });
    expect(fake.commits).toEqual([450, 10]);
    expect(await copier.write("e2", [{ path: "squads/s5", data: {} }], "e1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(fake.store.get("events/e2/squads/s5")).toEqual({ name: "taken" });
  });
});
