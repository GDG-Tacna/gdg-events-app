import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { CachedStoryTitle, FirestoreCommunicationStore } = await import("./firestore-communication-store");

type Doc = Record<string, unknown>;
function fakeFirestore(initial: Record<string, Doc> = {}, fail = false) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (fail) throw new Error("offline");
          return { exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) };
        },
        set: async (data: Doc) => {
          if (fail) throw new Error("offline");
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
  };
  return { store, store_: new FirestoreCommunicationStore(() => db as unknown as Firestore, testEventResolver) };
}

const PATH = "events/e1/config/story";

describe("FirestoreCommunicationStore story title", () => {
  it("reads nothing when the edition has no title, and treats a broken one as none", async () => {
    expect(await fakeFirestore().store_.readTitle()).toEqual(ok(null));
    expect(await fakeFirestore({ [PATH]: { title: 42 } }).store_.readTitle()).toEqual(ok(null));
    expect(await fakeFirestore({ [PATH]: { title: "Odisea de Código" } }).store_.readTitle()).toEqual(ok("Odisea de Código"));
  });

  it("saves the title in the edition's config, and a cleared one as null", async () => {
    const { store, store_ } = fakeFirestore();

    expect(await store_.saveTitle("La isla del tesoro")).toEqual(ok(undefined));
    expect(store.get(PATH)).toMatchObject({ title: "La isla del tesoro", updatedAt: expect.any(Date) });
    await store_.saveTitle(null);
    expect(store.get(PATH)).toMatchObject({ title: null });
  });

  it("reports a failed read or write", async () => {
    const { store_ } = fakeFirestore({}, true);

    expect(await store_.readTitle()).toEqual(err({ code: "unknown" }));
    expect(await store_.saveTitle("Odisea")).toEqual(err({ code: "unknown" }));
  });
});

describe("CachedStoryTitle", () => {
  it("reads once a minute, never caches a failure, and saving drops the cache", async () => {
    const clock = { now: 0 };
    const inner = { readTitle: vi.fn(async (): Promise<Result<string | null, { code: string }>> => ok("Odisea")) };
    const cached = new CachedStoryTitle(inner, 60_000, () => clock.now);

    inner.readTitle.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await cached.readTitle()).toEqual(err({ code: "unknown" }));
    expect(await cached.readTitle()).toEqual(ok("Odisea"));
    expect(await cached.readTitle()).toEqual(ok("Odisea"));
    expect(inner.readTitle).toHaveBeenCalledTimes(2);

    clock.now = 60_001;
    await cached.readTitle();
    expect(inner.readTitle).toHaveBeenCalledTimes(3);

    cached.invalidate();
    await cached.readTitle();
    expect(inner.readTitle).toHaveBeenCalledTimes(4);
  });
});
