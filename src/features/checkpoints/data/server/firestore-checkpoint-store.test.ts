import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => "__delete__" } }));

const { FirestoreCheckpointStore } = await import("./firestore-checkpoint-store");

type Doc = Record<string, unknown>;
const NONE = { minLevel: null, minTalks: null };
/** What every checkpoint without a description or an image reads as. */
const PLAIN = { description: "", image: null };

/**
 * In-memory stand-in for the slice of Firestore the store uses. `create` fails with the gRPC
 * ALREADY_EXISTS code when the document exists, as the real one does; updates run inside a transaction.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const writes: string[] = [];
  const docSnapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, ref: { path }, data: () => store.get(path) });
  const pick = (data: Doc | undefined, field: string) => field.split(".").reduce<unknown>((value, key) => (value as Doc | undefined)?.[key], data);

  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(docSnapshot) }),
      where: (field: string, op: string, value: unknown) => {
        const test = (found: unknown) => (op === "array-contains" ? Array.isArray(found) && found.includes(value) : found === value);
        const matches = () => [...store.keys()].filter((key) => key.startsWith(`${name}/`) && test(pick(store.get(key), field))).map(docSnapshot);
        const query = { isQuery: true, matches, limit: () => query, get: async () => ({ empty: matches().length === 0, docs: matches() }) };
        return query;
      },
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
        get: async (ref: { path: string; isQuery?: boolean; matches?: () => unknown[] }) => {
          if (!ref.isQuery) return docSnapshot(ref.path);
          const docs = ref.matches!();
          return { empty: docs.length === 0, docs };
        },
        delete: (ref: { path: string }) => pending.push(() => store.delete(ref.path)),
        create: (ref: { path: string }, data: Doc) => {
          pending.push(() => {
            store.set(ref.path, data);
            writes.push(`create ${ref.path}`);
          });
        },
        update: (ref: { path: string }, data: Doc) => {
          pending.push(() => {
            const next: Doc = { ...store.get(ref.path), ...data };
            for (const [key, value] of Object.entries(next)) if (value === "__delete__") delete next[key];
            store.set(ref.path, next);
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
        { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, ...PLAIN, requirements: NONE },
        { id: "talk-a", kind: "talk", name: "talk-a", active: true, ...PLAIN, requirements: NONE },
        { id: "talk-b", kind: "talk", name: "Zeta", active: false, ...PLAIN, requirements: NONE },
      ],
    });
  });

  it("creates a checkpoint under its id", async () => {
    const result = await store.create({ id: "coffee-1", kind: "catering", name: "Coffee break", active: true, ...PLAIN, requirements: NONE });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/checkpoints/coffee-1")).toMatchObject({ kind: "catering", name: "Coffee break", active: true });
  });

  it("does not overwrite an existing id: two admins cannot both create it", async () => {
    const result = await store.create({ id: "lunch-1", kind: "talk", name: "Otro", active: true, ...PLAIN, requirements: NONE });

    expect(result).toEqual({ ok: false, error: { code: "already-exists" } });
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toMatchObject({ kind: "catering", name: "Almuerzo" });
  });

  it("renames, reporting the checkpoint before and after, and touches only the name", async () => {
    const result = await store.update("lunch-1", { name: "Almuerzo día 1" });

    expect(result).toEqual({
      ok: true,
      value: {
        before: { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, ...PLAIN, requirements: NONE },
        after: { id: "lunch-1", kind: "catering", name: "Almuerzo día 1", active: true, ...PLAIN, requirements: NONE },
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
    expect(await broken.create({ id: "x-1", kind: "talk", name: "X", active: true, ...PLAIN, requirements: NONE })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.update("x-1", { active: false })).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("FirestoreCheckpointStore delete", () => {
  const station = { kind: "stand", name: "Stand Cloud", active: true };
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCheckpointStore>;

  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/checkpoints/stand-cloud": station, "events/e1/missions/other": { config: { type: "stand", checkpointId: "stand-ai" } } });
    store = new FirestoreCheckpointStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("deletes a station nobody used and no mission points at, and reports it", async () => {
    const result = await store.delete("stand-cloud");

    expect(result.ok && result.value.kind).toBe("deleted");
    expect(fake.store.has("events/e1/checkpoints/stand-cloud")).toBe(false);
  });

  it("keeps a station any cadet checked in at", async () => {
    fake.store.set("events/e1/checkins/u1_stand-cloud", { uid: "u1", checkpointId: "stand-cloud" });

    expect(await store.delete("stand-cloud")).toEqual({ ok: true, value: { kind: "has-check-ins" } });
    expect(fake.store.has("events/e1/checkpoints/stand-cloud")).toBe(true);
  });

  it("keeps a station a mission points at", async () => {
    fake.store.set("events/e1/missions/cloud-stand", { config: { type: "stand", checkpointId: "stand-cloud" } });

    expect(await store.delete("stand-cloud")).toEqual({ ok: true, value: { kind: "has-missions" } });
  });

  it("answers not-found for a missing or malformed station, and unknown when the database fails", async () => {
    expect(await store.delete("ghost-1")).toEqual({ ok: true, value: { kind: "not-found" } });
    const broken = new FirestoreCheckpointStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.delete("stand-cloud")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("FirestoreCheckpointStore description, image and kind", () => {
  const LOGO = "public/e1/checkpoint/abcdef123456.webp";
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCheckpointStore>;

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/checkpoints/louis-3d": { kind: "stand", name: "Louis 3D", active: true },
      "events/e1/checkpoints/lunch-1": { kind: "catering", name: "Almuerzo", active: true, requirements: { minLevel: 2, minTalks: null } },
    });
    store = new FirestoreCheckpointStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates with a description and an image path, and reads the image back with its address", async () => {
    await store.create({ id: "gate-1", kind: "entrance", name: "Puerta", active: true, description: "Por aquí", image: { path: LOGO, url: "/x" }, requirements: NONE });

    expect(fake.store.get("events/e1/checkpoints/gate-1")).toMatchObject({ description: "Por aquí", imagePath: LOGO });
    expect(await store.list()).toMatchObject({ ok: true, value: [{}, {}, { id: "gate-1", description: "Por aquí", image: { path: LOGO, url: `/media/${LOGO}` } }] });
  });

  it("saves and removes the description and the image", async () => {
    await store.update("louis-3d", { description: "Impresión 3D", image: { path: LOGO, url: "/x" } });
    expect(fake.store.get("events/e1/checkpoints/louis-3d")).toEqual({ kind: "stand", name: "Louis 3D", active: true, description: "Impresión 3D", imagePath: LOGO });

    const removed = await store.update("louis-3d", { image: null });
    expect(removed).toMatchObject({ ok: true, value: { before: { image: { path: LOGO } }, after: { image: null } } });
    expect(fake.store.get("events/e1/checkpoints/louis-3d")).not.toHaveProperty("imagePath");
  });

  it("changes the kind of a puesto nothing refers to, and clears a food gate it leaves", async () => {
    const result = await store.update("lunch-1", { kind: "stand", requirements: null });

    expect(result).toMatchObject({ ok: true, value: { before: { kind: "catering", requirements: { minLevel: 2 } }, after: { kind: "stand", requirements: NONE } } });
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toEqual({ kind: "stand", name: "Almuerzo", active: true });
  });

  it.each([
    ["a check-in", "events/e1/checkins/u1_louis-3d", { uid: "u1", checkpointId: "louis-3d" }, "has-check-ins"],
    ["a mission", "events/e1/missions/m1", { config: { type: "stand", checkpointId: "louis-3d" } }, "has-missions"],
  ])("refuses a new kind when %s refers to it, and writes nothing", async (_what, path, doc, code) => {
    fake.store.set(path, doc);

    expect(await store.update("louis-3d", { kind: "entrance" })).toEqual({ ok: false, error: { code } });
    expect(fake.writes).toEqual([]);
    // Its texts still change.
    expect(await store.update("louis-3d", { name: "Louis 3D Lab" })).toMatchObject({ ok: true });
  });
});

describe("FirestoreCheckpointStore rekey", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCheckpointStore>;
  const created = new Date("2026-10-01T00:00:00Z");

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/checkpoints/louis-3d": { kind: "stand", name: "Louis 3D", active: true, description: "3D", createdAt: created },
      "events/e1/checkpoints/lunch-1": { kind: "catering", name: "Almuerzo", active: true },
      "events/e1/staffScopes/s1": { checkpointIds: ["lunch-1", "louis-3d"] },
      "events/e1/staffScopes/s2": { checkpointIds: ["lunch-1"] },
    });
    store = new FirestoreCheckpointStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("moves the document with every field and the patch, and rewrites the staff scopes that listed it", async () => {
    const result = await store.rekey("louis-3d", "louis-lab", { name: "Louis Lab" });

    expect(result).toMatchObject({ ok: true, value: { before: { id: "louis-3d", name: "Louis 3D" }, after: { id: "louis-lab", name: "Louis Lab", description: "3D" } } });
    expect(fake.store.has("events/e1/checkpoints/louis-3d")).toBe(false);
    expect(fake.store.get("events/e1/checkpoints/louis-lab")).toEqual({ kind: "stand", name: "Louis Lab", active: true, description: "3D", createdAt: created });
    expect(fake.store.get("events/e1/staffScopes/s1")).toEqual({ checkpointIds: ["lunch-1", "louis-lab"] });
    expect(fake.store.get("events/e1/staffScopes/s2")).toEqual({ checkpointIds: ["lunch-1"] });
  });

  it.each([
    ["a check-in", "events/e1/checkins/u1_louis-3d", { uid: "u1", checkpointId: "louis-3d" }, "has-check-ins"],
    ["a mission", "events/e1/missions/m1", { config: { type: "stand", checkpointId: "louis-3d" } }, "has-missions"],
  ])("writes nothing when %s refers to the old id", async (_what, path, doc, code) => {
    fake.store.set(path, doc);

    expect(await store.rekey("louis-3d", "louis-lab", {})).toEqual({ ok: false, error: { code } });
    expect(fake.store.has("events/e1/checkpoints/louis-3d")).toBe(true);
    expect(fake.store.has("events/e1/checkpoints/louis-lab")).toBe(false);
    expect(fake.store.get("events/e1/staffScopes/s1")).toEqual({ checkpointIds: ["lunch-1", "louis-3d"] });
  });

  it("refuses a taken id, answers null for a missing puesto, and unknown when the database fails", async () => {
    expect(await store.rekey("louis-3d", "lunch-1", {})).toEqual({ ok: false, error: { code: "already-exists" } });
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toEqual({ kind: "catering", name: "Almuerzo", active: true });
    expect(await store.rekey("ghost-1", "ghost-2", {})).toEqual({ ok: true, value: null });
    const broken = new FirestoreCheckpointStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);
    expect(await broken.rekey("louis-3d", "louis-lab", {})).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("FirestoreCheckpointStore delete and usage", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCheckpointStore>;

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/checkpoints/louis-3d": { kind: "stand", name: "Louis 3D", active: true },
      "events/e1/checkpoints/lunch-1": { kind: "catering", name: "Almuerzo", active: true },
      "events/e1/staffScopes/s1": { checkpointIds: ["lunch-1", "louis-3d"] },
      "events/e1/checkins/u1_lunch-1": { uid: "u1", checkpointId: "lunch-1" },
    });
    store = new FirestoreCheckpointStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("takes a deleted puesto out of every staff scope", async () => {
    expect(await store.delete("louis-3d")).toMatchObject({ ok: true, value: { kind: "deleted" } });
    expect(fake.store.get("events/e1/staffScopes/s1")).toEqual({ checkpointIds: ["lunch-1"] });
  });

  it("tells, per id, whether check-ins and missions refer to it", async () => {
    fake.store.set("events/e1/missions/m1", { config: { type: "stand", checkpointId: "louis-3d" } });

    expect(await store.usage(["lunch-1", "louis-3d", "free-1"])).toEqual({
      ok: true,
      value: { "lunch-1": { checkIns: true, missions: false }, "louis-3d": { checkIns: false, missions: true }, "free-1": { checkIns: false, missions: false } },
    });
  });
});
