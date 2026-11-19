import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { CadetStore, IndexedCadet } from "../../domain/manage";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/active-event", () => ({ getActiveEventId: async () => "devfest-2026" }));

const { CachedCadetStore } = await import("./cached-cadet-store");

const CADET: IndexedCadet = {
  uid: "cadet-0001",
  alias: "Nova",
  aliasKey: "nova",
  squad: null,
  xp: 0,
  credits: 0,
  createdAt: null,
  attendedAt: null,
  banned: false,
  ticket: "general",
};
const EVERYONE = { cadets: [CADET], total: 1 };

function fakeStore() {
  return {
    list: vi.fn(async () => ok({ cadets: [], next: null, total: 0 })),
    listAll: vi.fn(async () => ok(EVERYONE)),
    get: vi.fn(async () => ok(null)),
    rename: vi.fn(async () => ok({ before: "Nova" })),
    setSquad: vi.fn(async () => ok({ before: null })),
    setBan: vi.fn(async () => ok({ wasBanned: false })),
    remove: vi.fn(async () => ok(null)),
  } satisfies CadetStore;
}

describe("CachedCadetStore", () => {
  it("reads every cadet once for the searches of the next minute, and again after it", async () => {
    const inner = fakeStore();
    let clock = 0;
    const store = new CachedCadetStore(inner, { now: () => clock });

    expect(await store.listAll()).toEqual(ok(EVERYONE));
    clock = 59_000;
    expect(await store.listAll()).toEqual(ok(EVERYONE));
    expect(inner.listAll).toHaveBeenCalledTimes(1);

    clock = 61_000;
    await store.listAll();
    expect(inner.listAll).toHaveBeenCalledTimes(2);
  });

  it("never keeps a failed read, so the next search tries again", async () => {
    const inner = fakeStore();
    inner.listAll.mockResolvedValueOnce(err({ code: "down" }) as never);
    const store = new CachedCadetStore(inner);

    expect(await store.listAll()).toEqual(err({ code: "down" }));
    expect(await store.listAll()).toEqual(ok(EVERYONE));
    expect(inner.listAll).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["renaming", (store: InstanceType<typeof CachedCadetStore>) => store.rename("cadet-0001", { display: "Otra", key: "otra" })],
    ["changing the squad", (store: InstanceType<typeof CachedCadetStore>) => store.setSquad("cadet-0001", "angular")],
    ["blocking", (store: InstanceType<typeof CachedCadetStore>) => store.setBan("cadet-0001", { reason: "Spam", by: "admin-1", at: new Date() })],
    ["deleting", (store: InstanceType<typeof CachedCadetStore>) => store.remove("cadet-0001")],
  ])("drops the kept list when %s goes through, so a search never shows the old data", async (_name, change) => {
    const inner = fakeStore();
    const store = new CachedCadetStore(inner);
    await store.listAll();

    await change(store);
    await store.listAll();

    expect(inner.listAll).toHaveBeenCalledTimes(2);
  });

  it("keeps the list when a change failed, since nothing changed", async () => {
    const inner = fakeStore();
    inner.rename.mockResolvedValueOnce(err({ code: "down" }) as never);
    const store = new CachedCadetStore(inner);
    await store.listAll();

    await store.rename("cadet-0001", { display: "Otra", key: "otra" });
    await store.listAll();

    expect(inner.listAll).toHaveBeenCalledTimes(1);
  });

  it("reads the list again after forget(), for a change made outside this store", async () => {
    const inner = fakeStore();
    const store = new CachedCadetStore(inner);
    await store.listAll();

    store.forget();
    await store.listAll();

    expect(inner.listAll).toHaveBeenCalledTimes(2);
  });

  it("keeps one list per edition", async () => {
    const inner = fakeStore();
    let edition = "devfest-2026";
    const store = new CachedCadetStore(inner, { key: async () => edition });

    await store.listAll();
    edition = "build-with-ai-2027";
    await store.listAll();
    await store.listAll();

    expect(inner.listAll).toHaveBeenCalledTimes(2);
  });

  it("sends pages and a single cadet straight to the store, never kept", async () => {
    const inner = fakeStore();
    const store = new CachedCadetStore(inner);

    await store.list({ after: null, limit: 25 });
    await store.list({ after: null, limit: 25 });
    await store.get("cadet-0001");
    await store.get("cadet-0001");

    expect(inner.list).toHaveBeenCalledTimes(2);
    expect(inner.get).toHaveBeenCalledTimes(2);
  });
});
