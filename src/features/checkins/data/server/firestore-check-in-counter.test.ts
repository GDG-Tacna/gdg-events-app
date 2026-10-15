import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreCheckInCounter } = await import("./firestore-check-in-counter");

function counterWith(docs: Record<string, Record<string, unknown>>) {
  const queries: string[] = [];
  /** Equality filters chained like the real query; the aggregation counts the documents that match them all. */
  const query = (name: string, filters: Array<[string, unknown]>) => ({
    where: (field: string, _op: string, value: unknown) => query(name, [...filters, [field, value]]),
    count: () => ({
      get: async () => {
        queries.push(`${name}?${filters.map(([field, value]) => `${field}==${String(value)}`).join("&")}`);
        const count = Object.values(docs).filter((doc) => filters.every(([field, value]) => doc[field] === value)).length;
        return { data: () => ({ count }) };
      },
    }),
    get: async () => {
      queries.push(`read ${name}?${filters.map(([field, value]) => `${field}==${String(value)}`).join("&")}`);
      return { docs: Object.values(docs).filter((doc) => filters.every(([field, value]) => doc[field] === value)).map((doc) => ({ data: () => doc })) };
    },
  });
  const db = { collection: withEventScope((name: string) => query(name, [])) } as unknown as Firestore;
  return { counter: new FirestoreCheckInCounter(() => db, testEventResolver), queries };
}

describe("FirestoreCheckInCounter", () => {
  it("counts the check-ins of one checkpoint in the active edition, with an aggregation", async () => {
    const { counter, queries } = counterWith({
      a: { checkpointId: "lunch-1" },
      b: { checkpointId: "lunch-1" },
      c: { checkpointId: "talk-1" },
    });

    expect(await counter.count("lunch-1")).toEqual({ ok: true, value: 2 });
    expect(queries).toEqual(["events/e1/checkins?checkpointId==lunch-1"]);
  });

  it("counts zero for a checkpoint nobody has used", async () => {
    const { counter } = counterWith({});

    expect(await counter.count("lunch-1")).toEqual({ ok: true, value: 0 });
  });

  it("does not even query for a malformed id", async () => {
    const { counter, queries } = counterWith({});

    expect(await counter.count("../users")).toEqual({ ok: true, value: 0 });
    expect(queries).toEqual([]);
  });

  it("reports a failure as an unknown error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreCheckInCounter(() => {
      throw new Error("boom");
    }, testEventResolver);

    expect(await broken.count("lunch-1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.talksAttended("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.checkpointIdsOf("u1", "talk")).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("lists which checkpoints of one kind a person checked in to", async () => {
    const { counter, queries } = counterWith({
      a: { uid: "u1", kind: "talk", checkpointId: "keynote" },
      b: { uid: "u1", kind: "talk", checkpointId: "firebase" },
      c: { uid: "u1", kind: "stand", checkpointId: "stand-cloud" },
      d: { uid: "u2", kind: "talk", checkpointId: "otra" },
      e: { uid: "u1", kind: "talk" },
    });

    expect(await counter.checkpointIdsOf("u1", "talk")).toEqual({ ok: true, value: new Set(["keynote", "firebase"]) });
    expect(queries).toEqual(["read events/e1/checkins?uid==u1&kind==talk"]);
  });

  it("counts the talks a person attended: their talk check-ins only", async () => {
    const { counter, queries } = counterWith({
      a: { uid: "u1", checkpointId: "talk-1", kind: "talk" },
      b: { uid: "u1", checkpointId: "talk-2", kind: "talk" },
      c: { uid: "u1", checkpointId: "lunch-1", kind: "catering" },
      d: { uid: "u2", checkpointId: "talk-1", kind: "talk" },
    });

    expect(await counter.talksAttended("u1")).toEqual({ ok: true, value: 2 });
    expect(await counter.talksAttended("u3")).toEqual({ ok: true, value: 0 });
    expect(queries[0]).toBe("events/e1/checkins?uid==u1&kind==talk");
  });

  it("counts a person's check-ins of any one kind, such as the stands visited", async () => {
    const { counter } = counterWith({
      a: { uid: "u1", checkpointId: "stand-ai", kind: "stand" },
      b: { uid: "u1", checkpointId: "talk-1", kind: "talk" },
      c: { uid: "u2", checkpointId: "stand-ai", kind: "stand" },
    });

    expect(await counter.checkInsOf("u1", "stand")).toEqual({ ok: true, value: 1 });
    expect(await counter.checkInsOf("u1", "catering")).toEqual({ ok: true, value: 0 });
  });
});
