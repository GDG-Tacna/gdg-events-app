import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestoreEditionCatalog, FirestoreEventStore } = await import("./firestore-event-store");

type Doc = Record<string, unknown>;
/** Documents by path; `phantoms` are editions with data under them but no document of their own. */
function fakeFirestore(initial: Record<string, Doc>, phantoms: string[] = []) {
  const store = new Map(Object.entries(initial));
  const writes: Array<{ path: string; data: Doc; options: unknown }> = [];
  const snap = (path: string) => ({ id: path.split("/").pop()!, exists: store.has(path), data: () => store.get(path) });
  const ref = (path: string) => ({
    path,
    id: path.split("/").pop()!,
    get: async () => snap(path),
    create: async (data: Doc) => {
      if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      store.set(path, data);
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      listDocuments: async () => [...new Set([...[...store.keys()].filter((key) => key.split("/").length === 2 && key.startsWith(`${name}/`)), ...phantoms.map((id) => `${name}/${id}`)])].map(ref),
    }),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snap(r.path)),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (r: { path: string }) => snap(r.path),
        set: (r: { path: string }, data: Doc, options: unknown) => {
          pending.push(() => {
            store.set(r.path, { ...store.get(r.path), ...data });
            writes.push({ path: r.path, data, options });
          });
        },
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store, writes };
}

const START = new Date("2026-10-24T14:00:00Z");
const END = new Date("2026-10-24T23:00:00Z");

describe("FirestoreEventStore", () => {
  it("reads the public edition's end and status from its document", async () => {
    const fake = fakeFirestore({ "events/e1": { name: "DevFest", endsAt: Timestamp.fromDate(END), status: "finished" } });

    expect(await new FirestoreEventStore(() => fake.db, testEventResolver).get()).toEqual({ ok: true, value: { id: "e1", endsAt: END, status: "finished" } });
  });

  it("has no end and is a draft while the document is missing or holds something else", async () => {
    const missing = fakeFirestore({});
    const odd = fakeFirestore({ "events/e1": { endsAt: "mañana", status: "over" } });

    expect(await new FirestoreEventStore(() => missing.db, testEventResolver).get()).toEqual({ ok: true, value: { id: "e1", endsAt: null, status: "draft" } });
    expect(await new FirestoreEventStore(() => odd.db, testEventResolver).get()).toEqual({ ok: true, value: { id: "e1", endsAt: null, status: "draft" } });
  });

  it("turns failures into an unknown error", async () => {
    const broken = new FirestoreEventStore(() => {
      throw new Error("boom");
    }, testEventResolver);

    expect(await broken.get()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("FirestoreEditionCatalog", () => {
  it("lists every edition, an older one with only data under it included", async () => {
    const fake = fakeFirestore({ "events/devfest-2027": { name: "DevFest 2027", venue: "UNJBG", startsAt: START, endsAt: END, status: "draft" } }, ["devfest-2026"]);

    const listed = await new FirestoreEditionCatalog(() => fake.db).list();

    expect(listed).toEqual({
      ok: true,
      value: [
        { id: "devfest-2027", name: "DevFest 2027", venue: "UNJBG", startsAt: START, endsAt: END, status: "draft" },
        { id: "devfest-2026", name: null, venue: null, startsAt: null, endsAt: null, status: "draft" },
      ],
    });
  });

  it("reads which edition is public, the default one without a config document, and refuses a broken id", async () => {
    expect(await new FirestoreEditionCatalog(() => fakeFirestore({ "config/app": { activeEventId: "meetup-nov" } }).db).publicId()).toEqual({ ok: true, value: "meetup-nov" });
    expect(await new FirestoreEditionCatalog(() => fakeFirestore({}).db).publicId()).toEqual({ ok: true, value: "devfest-2026" });
    expect(await new FirestoreEditionCatalog(() => fakeFirestore({ "config/app": { activeEventId: "Not Valid" } }).db).publicId()).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("creates an edition once, never overwriting", async () => {
    const fake = fakeFirestore({});
    const catalog = new FirestoreEditionCatalog(() => fake.db);
    const edition = { id: "meetup-nov", name: "Meetup", venue: null, startsAt: null, endsAt: END, status: "draft" as const };

    expect(await catalog.create(edition)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/meetup-nov")).toMatchObject({ name: "Meetup", endsAt: END, status: "draft", createdAt: expect.any(Date) });
    expect(await catalog.create(edition)).toEqual({ ok: false, error: { code: "already-exists" } });
  });

  it("updates by merging, so nothing else in the document is lost, and reports before and after", async () => {
    const fake = fakeFirestore({ "events/e1": { name: "DevFest", extra: 1 } });

    const result = await new FirestoreEditionCatalog(() => fake.db).update("e1", { endsAt: END, status: "finished" });

    expect(result).toMatchObject({ ok: true, value: { before: { name: "DevFest", endsAt: null, status: "draft" }, after: { name: "DevFest", endsAt: END, status: "finished" } } });
    expect(fake.writes[0]).toMatchObject({ path: "events/e1", options: { merge: true } });
    expect(fake.store.get("events/e1")).toMatchObject({ name: "DevFest", extra: 1, endsAt: END, status: "finished" });
  });

  it("makes an edition public and says which one was before", async () => {
    const fake = fakeFirestore({ "config/app": { activeEventId: "devfest-2026", other: true } });

    expect(await new FirestoreEditionCatalog(() => fake.db).publish("meetup-nov")).toEqual({ ok: true, value: { previous: "devfest-2026" } });
    expect(fake.store.get("config/app")).toMatchObject({ activeEventId: "meetup-nov", other: true });
    expect(await new FirestoreEditionCatalog(() => fakeFirestore({}).db).publish("meetup-nov")).toEqual({ ok: true, value: { previous: "devfest-2026" } });
  });

  it("turns failures into an unknown error", async () => {
    const broken = new FirestoreEditionCatalog(() => {
      throw new Error("boom");
    });

    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.publish("x1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.update("x1", { name: "Nuevo" })).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
