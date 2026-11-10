import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));

const { FirestoreQuadrantStore } = await import("./firestore-quadrant-store");

type Doc = Record<string, unknown>;

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
      where: (field: string, _op: string, value: unknown) => {
        const matches = () => [...store.keys()].filter((key) => key.startsWith(`${name}/`) && store.get(key)?.[field] === value).map(snapshot);
        const query = { isQuery: true, matches, limit: () => query };
        return query;
      },
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => snapshot(`${name}/${id}`),
        set: async (data: Doc) => void store.set(`${name}/${id}`, data),
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string; isQuery?: boolean; matches?: () => unknown[] }) => {
          if (!ref.isQuery) return snapshot(ref.path);
          const docs = ref.matches!();
          return { empty: docs.length === 0, docs };
        },
        delete: (ref: { path: string }) => pending.push(() => store.delete(ref.path)),
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

const AI = { id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 0, active: true } as const;
const PLAN = {
  width: 100,
  height: 100,
  areas: [{ id: "ai-1", kind: "stand", label: "Stand AI", quadrantId: "ai", rect: { x: 0, y: 0, width: 10, height: 10 } }],
} as const;

describe("FirestoreQuadrantStore (admin side)", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreQuadrantStore>;

  beforeEach(() => {
    fake = fakeFirestore({});
    store = new FirestoreQuadrantStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates a quadrant under its id, never over an existing one, and lists it", async () => {
    expect(await store.createQuadrant(AI)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/quadrants/ai")).toMatchObject({ name: "AI", planet: "ai", order: 0, active: true });
    expect(await store.listQuadrants()).toEqual({ ok: true, value: [AI] });

    expect(await store.createQuadrant(AI)).toEqual({ ok: false, error: { code: "already-exists" } });
  });

  it("updates only the given fields, reporting before and after; an unknown quadrant reads as missing", async () => {
    await store.createQuadrant(AI);

    expect(await store.updateQuadrant("ai", { tagline: "Nuevo", active: false })).toEqual({ ok: true, value: { before: AI, after: { ...AI, tagline: "Nuevo", active: false } } });
    expect(fake.store.get("events/e1/quadrants/ai")).toMatchObject({ name: "AI", tagline: "Nuevo", active: false });
    expect(await store.updateQuadrant("ghost", { active: false })).toEqual({ ok: true, value: null });
  });

  it("deletes a zone no mission is assigned to, and reports it", async () => {
    await store.createQuadrant(AI);
    fake.store.set("events/e1/missions/other", { quadrantId: "cloud" });

    expect(await store.deleteQuadrant("ai")).toEqual({ ok: true, value: { kind: "deleted", quadrant: AI } });
    expect(fake.store.has("events/e1/quadrants/ai")).toBe(false);
  });

  it("keeps a zone any mission is assigned to, active or not", async () => {
    await store.createQuadrant(AI);
    fake.store.set("events/e1/missions/ai-quiz", { quadrantId: "ai", active: false });

    expect(await store.deleteQuadrant("ai")).toEqual({ ok: true, value: { kind: "has-missions" } });
    expect(fake.store.has("events/e1/quadrants/ai")).toBe(true);
  });

  it("answers not-found for a zone that does not exist", async () => {
    expect(await store.deleteQuadrant("ghost")).toEqual({ ok: true, value: { kind: "not-found" } });
  });

  it("saves the order in one go", async () => {
    await store.createQuadrant(AI);
    await store.createQuadrant({ ...AI, id: "cloud", order: 1 });

    await store.setQuadrantOrder(["cloud", "ai"]);

    expect(fake.store.get("events/e1/quadrants/cloud")?.order).toBe(0);
    expect(fake.store.get("events/e1/quadrants/ai")?.order).toBe(1);
  });

  it("saves the plan as one document and reads it back", async () => {
    expect(await store.loadVenue()).toEqual({ ok: true, value: null });

    await store.saveVenue(PLAN);

    expect(fake.store.get("events/e1/venue/map")).toMatchObject({ width: 100, height: 100, areas: PLAN.areas });
    expect(await store.loadVenue()).toEqual({ ok: true, value: PLAN });
  });

  it("keeps the plan's background as its path and rebuilds its address when reading", async () => {
    const path = "public/e1/venue-plan/0f8e2c1a-1111-4222-8333-944455551111.svg";
    await store.saveVenue({ ...PLAN, background: { path, url: "ignored" } });

    expect(fake.store.get("events/e1/venue/map")).toMatchObject({ backgroundPath: path });
    expect(fake.store.get("events/e1/venue/map")).not.toHaveProperty("background");
    expect(await store.loadVenue()).toEqual({ ok: true, value: { ...PLAN, background: { path, url: `https://cdn/${path}` } } });

    await store.saveVenue(PLAN);
    expect(fake.store.get("events/e1/venue/map")).toMatchObject({ backgroundPath: null });
  });

  it("reports failed writes", async () => {
    const broken = new FirestoreQuadrantStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.createQuadrant(AI)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.updateQuadrant("ai", { active: false })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.setQuadrantOrder(["ai"])).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.deleteQuadrant("ai")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.saveVenue(PLAN)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.listQuadrants()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.loadVenue()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
