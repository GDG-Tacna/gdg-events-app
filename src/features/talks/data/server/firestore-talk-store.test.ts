import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Talk } from "../../domain/talk";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreTalkStore, toTalk } = await import("./firestore-talk-store");

type Doc = Record<string, unknown>;
const START = new Date("2026-10-24T14:00:00Z");
const END = new Date("2026-10-24T14:45:00Z");
const TALK: Talk = { id: "keynote", title: "Keynote", speaker: "Ana", startsAt: START, endsAt: END, roomId: "auditorio", description: "Resumen", active: true };

/** A slice of Firestore: documents, an equality query, create that fails on an existing id, and transactions. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        id,
        path: `${name}/${id}`,
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          if (op !== "==") throw new Error(`unexpected ${op}`);
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path, data]) => ({ id: path.split("/").pop()!, data: () => data }));
          return { docs };
        },
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (ref: { path: string }) => snapshot(ref.path),
        update: (ref: { path: string }, data: Doc) => store.set(ref.path, { ...store.get(ref.path), ...data }),
      }),
  };
  return { db: db as unknown as Firestore, store };
}

describe("toTalk", () => {
  it("reads a talk checkpoint, with Firestore timestamps", () => {
    expect(
      toTalk("keynote", { kind: "talk", name: " Keynote ", speaker: "Ana", startsAt: { toDate: () => START }, endsAt: END, roomId: "auditorio", description: "Resumen", active: true }),
    ).toEqual(TALK);
  });

  it("reads a talk made in Puestos (only a name) with the rest missing, and the id when it has no name", () => {
    expect(toTalk("vieja", { kind: "talk", active: false })).toEqual({ id: "vieja", title: "vieja", speaker: null, startsAt: null, endsAt: null, roomId: null, description: "", active: false });
  });

  it("is not a talk when the kind is another or the id is not a checkpoint id", () => {
    expect(toTalk("lunch-1", { kind: "catering", name: "Almuerzo" })).toBeNull();
    expect(toTalk("Bad Id", { kind: "talk" })).toBeNull();
    expect(toTalk("keynote", undefined)).toBeNull();
  });
});

describe("FirestoreTalkStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreTalkStore>;
  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/checkpoints/lunch-1": { kind: "catering", name: "Almuerzo", active: true } });
    store = new FirestoreTalkStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates a talk as a checkpoint of kind talk, and lists only the talks", async () => {
    expect(await store.create(TALK)).toEqual(ok(undefined));
    expect(fake.store.get("events/e1/checkpoints/keynote")).toMatchObject({
      kind: "talk",
      name: "Keynote",
      speaker: "Ana",
      startsAt: START,
      endsAt: END,
      roomId: "auditorio",
      description: "Resumen",
      active: true,
    });

    expect(await store.list()).toEqual(ok([TALK]));
  });

  it("never takes the id of an existing checkpoint, talk or station", async () => {
    expect(await store.create({ ...TALK, id: "lunch-1" })).toEqual(err({ code: "already-exists" }));
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toMatchObject({ kind: "catering" });
  });

  it("updates only the fields given, and reports the talk before and after", async () => {
    await store.create(TALK);

    const updated = await store.update("keynote", { title: "Keynote final", active: false });

    expect(updated).toEqual(ok({ before: TALK, after: { ...TALK, title: "Keynote final", active: false } }));
    expect(fake.store.get("events/e1/checkpoints/keynote")).toMatchObject({ name: "Keynote final", active: false, speaker: "Ana" });
  });

  it("answers null for an unknown talk, a station, or a malformed id, without writing", async () => {
    expect(await store.update("nope", { active: false })).toEqual(ok(null));
    expect(await store.update("lunch-1", { active: false })).toEqual(ok(null));
    expect(await store.update("../x", { active: false })).toEqual(ok(null));
    expect(fake.store.get("events/e1/checkpoints/lunch-1")).toMatchObject({ active: true });
  });

  it("reports failed reads and writes", async () => {
    const broken = new FirestoreTalkStore(() => {
      throw new Error("down");
    }, testEventResolver);

    expect(await broken.list()).toEqual(err({ code: "unknown" }));
    expect(await broken.create(TALK)).toEqual(err({ code: "unknown" }));
    expect(await broken.update("keynote", { active: false })).toEqual(err({ code: "unknown" }));
  });
});
