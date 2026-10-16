import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
vi.mock("@/features/media/server", () => ({ imageRefOf: (path: string) => ({ path, url: `/media/${path}` }) }));

const { FirestorePollStore, toPoll } = await import("./firestore-poll-store");

type Doc = Record<string, unknown>;

/** A fake Firestore over a map of paths: documents, collections with `where ==` / `limit` / `count`, and transactions. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snap = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path), ref: { path } });
  const children = (path: string) => [...store.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1);
  const query = (path: string, filters: Array<[string, unknown]> = [], max = Infinity) => {
    const matching = () => children(path).filter((key) => filters.every(([field, value]) => store.get(key)?.[field] === value)).slice(0, max);
    return {
      where: (field: string, _op: string, value: unknown) => query(path, [...filters, [field, value]], max),
      limit: (n: number) => query(path, filters, n),
      get: async () => {
        const docs = matching().map(snap);
        return { docs, empty: docs.length === 0 };
      },
      count: () => ({ get: async () => ({ data: () => ({ count: matching().length }) }) }),
    };
  };
  const doc = (path: string): Record<string, unknown> => ({
    path,
    get: async () => snap(path),
    create: async (data: Doc) => {
      if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      store.set(path, data);
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string) => ({ ...query(path), doc: (id: string) => doc(`${path}/${id}`) });
  const db = {
    collection: (name: string) => (name === "events" ? { doc: (id: string) => ({ collection: (sub: string) => collection(`events/${id}/${sub}`) }) } : collection(name)),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (target: { path?: string; get: () => Promise<unknown> }) => (target.path ? snap(target.path) : target.get()),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
        set: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
        delete: (ref: { path: string }) => pending.push(() => store.delete(ref.path)),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const BASE = "events/e1/polls";
const stored = (extra: Doc = {}): Doc => ({
  question: "¿Qué charla te gustó más?",
  options: [
    { id: "o1", text: "Keynote", imagePath: "public/e1/poll-option/abcdef123456.webp" },
    { id: "o2", text: "Firebase", imagePath: null },
  ],
  changeable: false,
  reward: { kind: "xp", amount: 20 },
  status: "draft",
  createdAt: new Date(0),
  openedAt: null,
  closedAt: null,
  ...extra,
});
const AT = new Date("2026-10-24T15:00:00Z");
const storeOver = (initial: Record<string, Doc>) => {
  const fake = fakeFirestore(initial);
  return { fake, polls: new FirestorePollStore(() => fake.db, testEventResolver) };
};

describe("FirestorePollStore", () => {
  it("reads a stored poll, rebuilding its pictures, and leaves out a broken one", () => {
    expect(toPoll("poll-1", stored())).toMatchObject({
      id: "poll-1",
      options: [{ id: "o1", image: { path: "public/e1/poll-option/abcdef123456.webp", url: "/media/public/e1/poll-option/abcdef123456.webp" } }, { id: "o2", image: null }],
      reward: { kind: "xp", amount: 20 },
    });
    expect(toPoll("poll-1", stored({ options: [{ id: "x", text: "A" }] }))).toBeNull();
    expect(toPoll("poll-1", stored({ status: "paused" }))).toBeNull();
    expect(toPoll("poll-1", stored({ reward: { kind: "xp", amount: 9999 } }))?.reward).toEqual({ kind: "none" });
  });

  it("creates a draft with its pictures by path, and edits it only while it is a draft", async () => {
    const { fake, polls } = storeOver({});
    const draft = toPoll("poll-1", stored())!;

    await polls.create(draft);
    expect(fake.store.get(`${BASE}/poll-1`)).toMatchObject({ status: "draft", options: [{ id: "o1", imagePath: "public/e1/poll-option/abcdef123456.webp" }, { id: "o2", imagePath: null }] });

    const edited = await polls.updateDraft("poll-1", { ...draft, question: "¿Otra pregunta?", reward: { kind: "none" } });
    expect(edited).toMatchObject({ ok: true, value: { after: { question: "¿Otra pregunta?" } } });
    expect(fake.store.get(`${BASE}/poll-1`)).toMatchObject({ question: "¿Otra pregunta?", reward: { kind: "none", amount: 0 } });

    fake.store.set(`${BASE}/poll-1`, stored({ status: "open" }));
    expect(await polls.updateDraft("poll-1", draft)).toEqual({ ok: true, value: "wrong-status" });
    expect(await polls.updateDraft("ghost-poll", draft)).toEqual({ ok: true, value: null });
  });

  it("opens a draft only while no other poll is open, and closes it", async () => {
    const { fake, polls } = storeOver({ [`${BASE}/poll-1`]: stored(), [`${BASE}/poll-2`]: stored() });

    expect(await polls.open("poll-1", AT)).toMatchObject({ ok: true, value: { status: "open", openedAt: AT } });
    expect(await polls.open("poll-2", AT)).toEqual({ ok: true, value: "another-open" });
    expect(await polls.openPoll()).toMatchObject({ ok: true, value: { id: "poll-1" } });
    expect(await polls.close("poll-1", AT)).toMatchObject({ ok: true, value: { status: "closed" } });
    expect(fake.store.get(`${BASE}/poll-1`)).toMatchObject({ status: "closed", closedAt: AT });
    expect(await polls.close("poll-1", AT)).toEqual({ ok: true, value: "wrong-status" });
    expect(await polls.openPoll()).toEqual({ ok: true, value: null });
  });

  it("deletes only a draft", async () => {
    const { fake, polls } = storeOver({ [`${BASE}/poll-1`]: stored(), [`${BASE}/poll-2`]: stored({ status: "closed" }) });

    expect(await polls.removeDraft("poll-2")).toEqual({ ok: true, value: "wrong-status" });
    expect(await polls.removeDraft("poll-1")).toMatchObject({ ok: true, value: { id: "poll-1" } });
    expect(fake.store.has(`${BASE}/poll-1`)).toBe(false);
  });

  it("records one vote per cadet, changes it only when the poll allows, never after it closed, and counts them", async () => {
    const { fake, polls } = storeOver({ [`${BASE}/poll-1`]: stored({ status: "open" }), [`${BASE}/poll-2`]: stored({ status: "open", changeable: true }) });

    expect(await polls.cast("poll-1", "u1", "o1", AT)).toMatchObject({ ok: true, value: { first: true, poll: { id: "poll-1" } } });
    expect(await polls.cast("poll-1", "u1", "o2", AT)).toEqual({ ok: true, value: "already-voted" });
    expect(await polls.cast("poll-1", "u2", "o9", AT)).toEqual({ ok: true, value: "invalid-option" });
    await polls.cast("poll-1", "u2", "o1", AT);
    await polls.cast("poll-1", "u3", "o2", AT);
    expect(await polls.myVote("poll-1", "u1")).toEqual({ ok: true, value: "o1" });
    expect(await polls.myVote("poll-1", "u9")).toEqual({ ok: true, value: null });
    expect(await polls.tally("poll-1")).toEqual({ ok: true, value: { counts: { o1: 2, o2: 1 }, total: 3 } });

    await polls.cast("poll-2", "u1", "o1", AT);
    expect(await polls.cast("poll-2", "u1", "o2", new Date("2026-10-24T15:01:00Z"))).toMatchObject({ ok: true, value: { first: false } });
    expect(fake.store.get(`${BASE}/poll-2/votes/u1`)).toMatchObject({ optionId: "o2", at: AT });

    fake.store.set(`${BASE}/poll-1`, stored({ status: "closed" }));
    expect(await polls.cast("poll-1", "u4", "o1", AT)).toEqual({ ok: true, value: "closed" });
    expect(await polls.cast("ghost-poll", "u4", "o1", AT)).toEqual({ ok: true, value: null });
  });
});
