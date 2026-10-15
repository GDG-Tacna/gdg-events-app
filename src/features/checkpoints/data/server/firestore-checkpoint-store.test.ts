import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreCheckpointStore } = await import("./firestore-checkpoint-store");

type Doc = Record<string, unknown>;
const NONE = { minLevel: null, minTalks: null };

/**
 * In-memory stand-in for the slice of Firestore the store uses. `create` fails with the gRPC
 * ALREADY_EXISTS code when the document exists, as the real one does; updates run inside a transaction.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const writes: string[] = [];
  const docSnapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });

  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(docSnapshot) }),
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => docSnapshot(`${name}/${id}`),
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
          writes.push(`create ${name}/${id}`);
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
            writes.push(`update ${ref.path}`);
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

describe("FirestoreCheckpointStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCheckpointStore>;

  const setup = (docs: Record<string, Doc>) => {
    fake = fakeFirestore(docs);
    store = new FirestoreCheckpointStore(() => fake.db, testEventResolver);
  };

  beforeEach(() => {
    setup({
      "events/e1/checkpoints/lunch-1": { kind: "catering", name: "Almuerzo", active: true },
      "events/e1/checkpoints/talk-b": { kind: "talk", name: "Zeta", active: false },
      "events/e1/checkpoints/talk-a": { kind: "talk", active: true },
      "events/e1/checkpoints/odd-1": { kind: "sponsor", name: "Raro", active: true },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lists open and closed checkpoints ordered by name, skipping malformed ones", async () => {
    expect(await store.list()).toEqual({
      ok: true,
      value: [
        { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, requirements: NONE },
        { id: "talk-a", kind: "talk", name: "talk-a", active: true, requirements: NONE },
        { id: "talk-b", kind: "talk", name: "Zeta", active: false, requirements: NONE },
      ],
    });
  });

  it("creates a checkpoint under its id", async () => {
    const result = await store.create({ id: "coffee-1", kind: "catering", name: "Coffee break", active: true, requirements: NONE });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/checkpoints/coffee-1")).toMatchObject({ kind: "catering", name: "Coffee break", active: true });
  });

  it("does not overwrite an existing id: two admins cannot both create it", async () => {
    const result = await store.create({ id: "lunch-1", kind: "talk", name: "Otro", active: true, requirements: NONE });

    expect(result).toEqual({ ok: false, error: { code: "already-exists" } });
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toMatchObject({ kind: "catering", name: "Almuerzo" });
  });

  it("renames, reporting the checkpoint before and after, and touches only the name", async () => {
    const result = await store.update("lunch-1", { name: "Almuerzo día 1" });

    expect(result).toEqual({
      ok: true,
      value: {
        before: { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, requirements: NONE },
        after: { id: "lunch-1", kind: "catering", name: "Almuerzo día 1", active: true, requirements: NONE },
      },
    });
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toEqual({ kind: "catering", active: true, name: "Almuerzo día 1" });
  });

  it("opens and closes without changing the name or the kind", async () => {
    await store.update("lunch-1", { active: false });

    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toEqual({ kind: "catering", name: "Almuerzo", active: false });
  });

  describe("food gate", () => {
    const LUNCH = { minLevel: 2, minTalks: 3 };

    it("saves a meal's requirements and reads them back", async () => {
      const result = await store.update("lunch-1", { requirements: LUNCH });

      expect(result).toMatchObject({ ok: true, value: { before: { requirements: NONE }, after: { requirements: LUNCH } } });
      expect(fake.store.get("events/e1/checkpoints/lunch-1")).toEqual({ kind: "catering", name: "Almuerzo", active: true, requirements: LUNCH });
      expect(await store.list()).toMatchObject({ ok: true, value: [{ id: "lunch-1", requirements: LUNCH }, {}, {}] });
      expect(await store.requirementsOf("lunch-1")).toEqual({ ok: true, value: LUNCH });
    });

    it("reads no requirements for a meal without them, a broken value, another kind or a missing checkpoint", async () => {
      fake.store.set("events/e1/checkpoints/coffee-1", { kind: "catering", name: "Café", active: true, requirements: { minLevel: 99 } });
      fake.store.set("events/e1/checkpoints/talk-c", { kind: "talk", name: "Charla", active: true, requirements: LUNCH });

      expect(await store.requirementsOf("lunch-1")).toEqual({ ok: true, value: NONE });
      expect(await store.requirementsOf("coffee-1")).toEqual({ ok: true, value: NONE });
      expect(await store.requirementsOf("talk-c")).toEqual({ ok: true, value: NONE });
      expect(await store.requirementsOf("nope-1")).toEqual({ ok: true, value: NONE });
      expect(await store.requirementsOf("Bad Id")).toEqual({ ok: true, value: NONE });
      expect(await store.requirementsOf("odd-1")).toEqual({ ok: true, value: NONE });
    });

    it("reports a failed read instead of guessing", async () => {
      const broken = new FirestoreCheckpointStore(() => {
        throw new Error("boom");
      }, testEventResolver);

      expect(await broken.requirementsOf("lunch-1")).toEqual({ ok: false, error: { code: "unknown" } });
    });
  });

  it("returns null for a missing or malformed checkpoint and writes nothing", async () => {
    expect(await store.update("nope-1", { active: false })).toEqual({ ok: true, value: null });
    expect(await store.update("odd-1", { active: false })).toEqual({ ok: true, value: null });
    expect(fake.writes).toEqual([]);
  });

  it("works inside the active edition only", async () => {
    const nextEdition = new FirestoreCheckpointStore(() => fake.db, async () => "e2");

    expect(await nextEdition.list()).toEqual({ ok: true, value: [] });
    expect(await nextEdition.update("lunch-1", { active: false })).toEqual({ ok: true, value: null });
    expect(await nextEdition.requirementsOf("lunch-1")).toEqual({ ok: true, value: NONE });
  });

  it("turns unexpected failures into an unknown error", async () => {
    const broken = new FirestoreCheckpointStore(() => {
      throw new Error("boom");
    }, testEventResolver);

    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.create({ id: "x-1", kind: "talk", name: "X", active: true, requirements: NONE })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.update("x-1", { active: false })).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
