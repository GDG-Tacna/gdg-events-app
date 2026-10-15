import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Badge } from "../../domain/badge";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));

const { CachedBadgeSource, FirestoreBadgeStore } = await import("./firestore-badge-store");

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

const FIRST: Badge = { id: "primer-salto", name: "Primer salto", description: "Completa tu primera misión.", tone: "cyan", rule: { type: "missions-completed", count: 1 }, order: 0, active: true, image: null };
const AI: Badge = { id: "maestro-ia", name: "Maestro de la IA", description: "Completa el cuadrante de IA.", tone: "gold", rule: { type: "quadrant-complete", quadrantId: "ai" }, order: 1, active: true, image: null };

describe("FirestoreBadgeStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreBadgeStore>;
  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/achievements/broken": { name: "x" } });
    store = new FirestoreBadgeStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates under its id, never over an existing one, and lists skipping (and logging) what cannot be shown", async () => {
    expect(await store.create(FIRST)).toEqual(ok(undefined));
    expect(await store.create(FIRST)).toEqual(err({ code: "already-exists" }));
    await store.create(AI);

    const { name, description, tone, rule, order, active } = FIRST;
    expect(fake.store.get("events/e1/achievements/primer-salto")).toEqual({ name, description, tone, rule, order, active, imagePath: null, createdAt: expect.any(Date) });
    expect(await store.list()).toEqual(ok([FIRST, AI]));
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("updates in a transaction, replacing the whole rule, and answers before and after", async () => {
    await store.create(AI);
    const rule = { type: "missions-completed" as const, count: 3 };

    expect(await store.update("maestro-ia", { name: "Nuevo", rule, description: undefined })).toEqual(ok({ before: AI, after: { ...AI, name: "Nuevo", rule } }));
    expect(fake.store.get("events/e1/achievements/maestro-ia")).toMatchObject({ name: "Nuevo", rule, description: AI.description });
    expect(await store.list()).toMatchObject({ ok: true, value: [{ id: "maestro-ia", rule: { type: "missions-completed", count: 3 } }] });
  });

  it("keeps the image as its path and rebuilds its address when reading", async () => {
    const path = "public/e1/badge/0f8e2c1a-1111-4222-8333-944455551111.webp";
    await store.create({ ...FIRST, image: { path, url: "ignored" } });
    expect(fake.store.get("events/e1/achievements/primer-salto")).toMatchObject({ imagePath: path });
    expect(fake.store.get("events/e1/achievements/primer-salto")).not.toHaveProperty("image");

    const listed = await store.list();
    expect(listed.ok && listed.value[0].image).toEqual({ path, url: `https://cdn/${path}` });

    expect(await store.update("primer-salto", { image: null })).toMatchObject({ ok: true, value: { after: { image: null } } });
    expect(fake.store.get("events/e1/achievements/primer-salto")).toMatchObject({ imagePath: null });
  });

  it("ignores a stored path that is not a badge image", async () => {
    await store.create(FIRST);
    fake.store.set("events/e1/achievements/primer-salto", { ...fake.store.get("events/e1/achievements/primer-salto"), imagePath: "public/e1/raffle-prize/x1234567.webp" });

    const listed = await store.list();
    expect(listed.ok && listed.value[0].image).toBeNull();
  });

  it("answers null for a missing or broken badge, writing nothing", async () => {
    expect(await store.update("nope", { active: false })).toEqual(ok(null));
    expect(await store.update("broken", { active: false })).toEqual(ok(null));
    expect(fake.store.get("events/e1/achievements/broken")).toEqual({ name: "x" });
  });

  it("saves the order in one batch", async () => {
    await store.create(FIRST);
    await store.create(AI);

    expect(await store.setOrder(["maestro-ia", "primer-salto"])).toEqual(ok(undefined));
    expect(fake.store.get("events/e1/achievements/maestro-ia")?.order).toBe(0);
    expect(fake.store.get("events/e1/achievements/primer-salto")?.order).toBe(1);
  });

  it("reports failures as unknown", async () => {
    const broken = new FirestoreBadgeStore(() => {
      throw new Error("offline");
    }, testEventResolver);

    expect(await broken.list()).toEqual(err({ code: "unknown" }));
    expect(await broken.create(FIRST)).toEqual(err({ code: "unknown" }));
    expect(await broken.update("x", { active: false })).toEqual(err({ code: "unknown" }));
    expect(await broken.setOrder(["x"])).toEqual(err({ code: "unknown" }));
  });
});

describe("CachedBadgeSource", () => {
  it("keeps a good read for a while, never a failed one, and drops it on demand", async () => {
    let time = 0;
    const answers: Array<Result<readonly Badge[], { code: string }>> = [err({ code: "unknown" }), ok([FIRST]), ok([AI]), ok([])];
    const source = { list: vi.fn(async () => answers.shift()!) };
    const cached = new CachedBadgeSource(source, 1000, () => time);

    expect(await cached.list()).toEqual(err({ code: "unknown" }));
    expect(await cached.list()).toEqual(ok([FIRST]));
    time = 999;
    expect(await cached.list()).toEqual(ok([FIRST]));
    time = 1001;
    expect(await cached.list()).toEqual(ok([AI]));
    cached.invalidate();
    expect(await cached.list()).toEqual(ok([]));
    expect(source.list).toHaveBeenCalledTimes(4);
  });
});
