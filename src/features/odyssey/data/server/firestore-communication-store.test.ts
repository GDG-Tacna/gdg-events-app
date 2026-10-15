import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Communication } from "../../domain/communication";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { CachedCommunicationSource, FirestoreCommunicationStore } = await import("./firestore-communication-store");

type Doc = Record<string, unknown>;
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
      doc: (id: string) => ({
        path: `${name}/${id}`,
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => snapshot(ref.path),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
    batch: () => {
      const pending: Array<() => void> = [];
      return {
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
        commit: async () => pending.forEach((write) => write()),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const SIGNAL: Communication = { id: "ai-senal", quadrantId: "ai", title: "Señal", body: "Una señal llega desde AI.", unlockMissionId: null, order: 0, active: true };

describe("FirestoreCommunicationStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCommunicationStore>;
  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/communications/broken": { title: "x" } });
    store = new FirestoreCommunicationStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates, never over an existing id, and lists skipping (and logging) what cannot be shown", async () => {
    expect(await store.create(SIGNAL)).toEqual(ok(undefined));
    expect(await store.create(SIGNAL)).toEqual(err({ code: "already-exists" }));

    expect(await store.list()).toEqual(ok([SIGNAL]));
    expect(console.error).toHaveBeenCalled();
  });

  it("updates only the given fields, and reads an unknown one as missing", async () => {
    await store.create(SIGNAL);

    expect(await store.update("ai-senal", { unlockMissionId: "ai-stand", active: false })).toEqual(ok({ before: SIGNAL, after: { ...SIGNAL, unlockMissionId: "ai-stand", active: false } }));
    expect(await store.update("ghost", { active: false })).toEqual(ok(null));
  });

  it("saves the order in one go", async () => {
    await store.create(SIGNAL);
    await store.create({ ...SIGNAL, id: "ai-otra", order: 5 });

    await store.setOrder(["ai-otra", "ai-senal"]);

    expect(fake.store.get("events/e1/communications/ai-otra")?.order).toBe(0);
  });

  it("reports failed reads and writes", async () => {
    const broken = new FirestoreCommunicationStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);
    for (const call of [() => broken.list(), () => broken.create(SIGNAL), () => broken.update("x1", {}), () => broken.setOrder(["x1"])]) {
      expect(await call()).toEqual(err({ code: "unknown" }));
    }
  });
});

describe("CachedCommunicationSource", () => {
  it("reads once a minute, never caches a failure, and an admin change drops the cache", async () => {
    const clock = { now: 0 };
    const inner = { list: vi.fn(async (): Promise<Result<readonly Communication[], { code: string }>> => ok([SIGNAL])) };
    const cached = new CachedCommunicationSource(inner, 60_000, () => clock.now);

    inner.list.mockResolvedValueOnce(err({ code: "x" }));
    expect(await cached.list()).toEqual(err({ code: "x" }));
    await cached.list();
    clock.now = 59_999;
    await cached.list();
    expect(inner.list).toHaveBeenCalledTimes(2);

    cached.invalidate();
    await cached.list();
    expect(inner.list).toHaveBeenCalledTimes(3);
  });
});
