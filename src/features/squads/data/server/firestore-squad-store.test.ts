import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));

const { FirestoreSquadStore } = await import("./firestore-squad-store");

type Doc = Record<string, unknown>;

const rows = Array.from({ length: 16 }, (_, y) => (y === 8 ? ".......a........" : "................"));
const LOGO = { rows, palette: { a: "#22d3ee" } };

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const writes: string[] = [];
  const docSnapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });

  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(docSnapshot) }),
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
      const tx = {
        get: async (ref: { path: string }) => docSnapshot(ref.path),
        update: (ref: { path: string }, data: Doc) => {
          pending.push(() => {
            store.set(ref.path, { ...store.get(ref.path), ...data });
            writes.push(`update ${ref.path} ${Object.keys(data).join(",")}`);
          });
        },
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
    batch: () => {
      const pending: Array<() => void> = [];
      return {
        update: (ref: { path: string }, data: Doc) =>
          pending.push(() => {
            if (!store.has(ref.path)) throw new Error("NOT_FOUND");
            store.set(ref.path, { ...store.get(ref.path), ...data });
          }),
        commit: async () => pending.forEach((write) => write()),
      };
    },
  };
  return { db: db as unknown as Firestore, store, writes };
}

const doc = (name: string, order: number, extra: Doc = {}) => ({ name, tagline: "Lema", sprite: LOGO, active: true, order, ...extra });

describe("FirestoreSquadStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreSquadStore>;

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/squads/gemini": doc("Escuadrón Gemini", 2),
      "events/e1/squads/angular": doc("Escuadrón Angular", 0),
      "events/e1/squads/cloud": doc("Escuadrón Cloud", 1, { active: false }),
      "events/e1/squads/broken": doc("Roto", 3, { sprite: { rows: ["x"], palette: {} } }),
      "events/e1/squads/nameless": { tagline: "x", sprite: LOGO, order: 4 },
    });
    store = new FirestoreSquadStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lists the edition's squads in order, retired ones included, skipping malformed ones", async () => {
    const result = await store.list();

    expect(result.ok && result.value.map((squad) => [squad.id, squad.active])).toEqual([
      ["angular", true],
      ["cloud", false],
      ["gemini", true],
    ]);
  });

  it("creates a squad under its id, with its logo", async () => {
    const result = await store.create({ id: "android", name: "Android", tagline: "Robots", sprite: LOGO, active: true, order: 3 });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/squads/android")).toMatchObject({ name: "Android", sprite: LOGO, active: true, order: 3 });
  });

  it("keeps an uploaded logo as its path and rebuilds its address when reading", async () => {
    const path = "public/e1/squad-logo/0f8e2c1a-1111-4222-8333-944455551111.svg";
    await store.create({ id: "android", name: "Android", tagline: "Robots", sprite: LOGO, logo: { path, url: "ignored" }, active: true, order: 3 });
    expect(fake.store.get("events/e1/squads/android")).toMatchObject({ logoPath: path });
    expect(fake.store.get("events/e1/squads/android")).not.toHaveProperty("logo");

    const listed = await store.list();
    expect(listed.ok && listed.value.find((squad) => squad.id === "android")?.logo).toEqual({ path, url: `https://cdn/${path}` });
    expect(listed.ok && listed.value.find((squad) => squad.id === "gemini")?.logo).toBeNull();

    await store.update("android", { logo: null });
    expect(fake.store.get("events/e1/squads/android")).toMatchObject({ logoPath: null });
  });

  it("never overwrites an existing id", async () => {
    expect(await store.create({ id: "gemini", name: "Otro", tagline: "x", sprite: LOGO, active: true, order: 9 })).toEqual({
      ok: false,
      error: { code: "already-exists" },
    });
    expect(fake.store.get("events/e1/squads/gemini")).toMatchObject({ name: "Escuadrón Gemini" });
  });

  it("updates only the fields sent and reports before and after", async () => {
    const result = await store.update("gemini", { active: false });

    expect(result).toMatchObject({ ok: true, value: { before: { active: true }, after: { id: "gemini", active: false, name: "Escuadrón Gemini" } } });
    expect(fake.writes).toEqual(["update events/e1/squads/gemini active"]);
  });

  it("returns null for a missing or malformed squad and writes nothing", async () => {
    expect(await store.update("android", { name: "x" })).toEqual({ ok: true, value: null });
    expect(await store.update("broken", { name: "x" })).toEqual({ ok: true, value: null });
    expect(fake.writes).toEqual([]);
  });

  it("saves the order as each id's position", async () => {
    await store.setOrder(["gemini", "angular", "cloud"]);

    expect(fake.store.get("events/e1/squads/gemini")).toMatchObject({ order: 0 });
    expect(fake.store.get("events/e1/squads/angular")).toMatchObject({ order: 1 });
    expect(fake.store.get("events/e1/squads/cloud")).toMatchObject({ order: 2 });
  });

  it("works inside the active edition only", async () => {
    const next = new FirestoreSquadStore(() => fake.db, async () => "e2");

    expect(await next.list()).toEqual({ ok: true, value: [] });
  });

  it("turns unexpected failures into an unknown error", async () => {
    const broken = new FirestoreSquadStore(() => {
      throw new Error("boom");
    }, testEventResolver);

    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.create({ id: "x-1", name: "X", tagline: "x", sprite: LOGO, active: true, order: 0 })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.update("x-1", { active: false })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.setOrder(["x-1"])).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
