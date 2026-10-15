import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreStatsSource } = await import("./firestore-stats-source");

type Doc = Record<string, unknown>;

/** Collections by path; queries chain equality and "not null" filters; count() and get() answer from the docs. */
function fakeFirestore(collections: Record<string, Record<string, Doc>>, editionIds: string[]) {
  const queries: string[] = [];
  const query = (path: string, filters: Array<[string, string, unknown]>) => {
    const matching = () =>
      Object.entries(collections[path] ?? {}).filter(([, doc]) =>
        filters.every(([field, op, value]) => (op === "!=" ? doc[field] !== undefined && doc[field] !== value : doc[field] === value)),
      );
    return {
      where: (field: string, op: string, value: unknown) => query(path, [...filters, [field, op, value]]),
      count: () => ({
        get: async () => {
          queries.push(`${path}?${filters.map(([f, o, v]) => `${f}${o}${String(v)}`).join("&")}`);
          return { data: () => ({ count: matching().length }) };
        },
      }),
      get: async () => ({ docs: matching().map(([id, doc]) => ({ id, data: () => doc })) }),
    };
  };
  const db = {
    collection: (name: string) => ({
      listDocuments: async () => editionIds.map((id) => ({ id })),
      doc: (eventId: string) => ({ collection: (sub: string) => query(`${name}/${eventId}/${sub}`, []) }),
    }),
  };
  return { db: db as unknown as Firestore, queries };
}

const E = "events/devfest-2026";
const fake = () =>
  fakeFirestore(
    {
      [`${E}/participants`]: { a: { attendedAt: new Date() }, b: {}, c: { attendedAt: new Date() } },
      [`${E}/checkins`]: { 1: { kind: "talk", checkpointId: "keynote" }, 2: { kind: "stand", checkpointId: "stand-1" }, 3: { kind: "catering", checkpointId: "lunch" }, 4: { kind: "catering", checkpointId: "lunch" } },
      [`${E}/checkpoints`]: { lunch: { kind: "catering", name: "Almuerzo" }, coffee: { kind: "catering" }, keynote: { kind: "talk", name: "Keynote" } },
      [`${E}/missionCompletions`]: { x: { status: "completed" }, y: { status: "failed" } },
      [`${E}/contacts`]: { p: {}, q: {} },
    },
    ["devfest-2025", "devfest-2026"],
  );

describe("FirestoreStatsSource", () => {
  it("counts each number with an aggregation over the edition's data", async () => {
    const f = fake();
    const stats = new FirestoreStatsSource(() => f.db);

    expect(await stats.registered("devfest-2026")).toEqual({ ok: true, value: 3 });
    expect(await stats.attended("devfest-2026")).toEqual({ ok: true, value: 2 });
    expect(await stats.checkInsOfKind("devfest-2026", "talk")).toEqual({ ok: true, value: 1 });
    expect(await stats.checkInsOfKind("devfest-2026", "stand")).toEqual({ ok: true, value: 1 });
    expect(await stats.missionsCompleted("devfest-2026")).toEqual({ ok: true, value: 1 });
    expect(await stats.contacts("devfest-2026")).toEqual({ ok: true, value: 2 });
    expect(f.queries).toEqual([
      `${E}/participants?`,
      `${E}/participants?attendedAt!=null`,
      `${E}/checkins?kind==talk`,
      `${E}/checkins?kind==stand`,
      `${E}/missionCompletions?status==completed`,
      `${E}/contacts?`,
    ]);
  });

  it("lists every edition, including one whose own document was never written", async () => {
    expect(await new FirestoreStatsSource(() => fake().db).editions()).toEqual({ ok: true, value: ["devfest-2025", "devfest-2026"] });
  });

  it("counts the rations of each meal, named by the checkpoint (or its id)", async () => {
    const rations = await new FirestoreStatsSource(() => fake().db).rations("devfest-2026");

    expect(rations).toEqual({
      ok: true,
      value: [
        { checkpointId: "lunch", name: "Almuerzo", count: 2 },
        { checkpointId: "coffee", name: "coffee", count: 0 },
      ],
    });
  });

  it("reports failed reads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreStatsSource(() => {
      throw new Error("down");
    });

    for (const call of [() => broken.editions(), () => broken.registered("e"), () => broken.attended("e"), () => broken.contacts("e"), () => broken.rations("e")]) {
      expect(await call()).toEqual({ ok: false, error: { code: "unknown" } });
    }
  });
});
