import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreRankingSource } = await import("./firestore-ranking-source");

type Doc = Record<string, unknown>;
type Filter = [string, string, unknown];
const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 15, minute));

const compare = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : typeof a === "string" || typeof b === "string" ? (a === b ? 0 : String(a) < String(b) ? -1 : 1) : (a as number) - (b as number);
const matches = (data: Doc, [field, op, value]: Filter) => {
  const raw = data[field] as { toDate?: () => Date } | undefined;
  // Stored timestamps compare as dates, as Firestore does.
  const v = raw && typeof raw.toDate === "function" ? raw.toDate() : raw;
  if (v === undefined) return false;
  if (op === "==") return compare(v, value) === 0;
  if (op === ">") return compare(v, value) > 0;
  if (op === "<") return compare(v, value) < 0;
  throw new Error(`unexpected ${op}`);
};

/** Participants and the query shapes the source uses: where, orderBy (desc), limit, count and sum aggregations. */
function fakeFirestore(participants: Record<string, Doc>) {
  const queries: string[] = [];
  const query = (name: string, filters: Filter[] = [], order: string | null = null, max: number | null = null): unknown => {
    const rows = () => {
      if (name !== "events/e1/participants") return [];
      let docs = Object.entries(participants).filter(([, data]) => filters.every((f) => matches(data, f)));
      if (order) docs = docs.filter(([, d]) => d[order] !== undefined).sort(([, a], [, b]) => compare(b[order], a[order]));
      if (max !== null) docs = docs.slice(0, max);
      return docs;
    };
    return {
      where: (field: string, op: string, value: unknown) => query(name, [...filters, [field, op, value]], order, max),
      orderBy: (field: string, dir: string) => {
        if (dir !== "desc") throw new Error("only desc");
        return query(name, filters, field, max);
      },
      limit: (n: number) => query(name, filters, order, n),
      get: async () => {
        queries.push(`get ${filters.map((f) => f.join("")).join("&")}${order ? ` order:${order}` : ""}${max ? ` limit:${max}` : ""}`);
        return { docs: rows().map(([id, data]) => ({ id, data: () => data })) };
      },
      count: () => ({
        get: async () => {
          queries.push(`count ${filters.map((f) => f.join("")).join("&")}`);
          return { data: () => ({ count: rows().length }) };
        },
      }),
      aggregate: (spec: Record<string, unknown>) => ({
        get: async () => {
          queries.push(`aggregate ${filters.map((f) => f.join("")).join("&")} ${Object.keys(spec).join(",")}`);
          const docs = rows();
          return { data: () => ({ xp: docs.reduce((sum, [, d]) => sum + ((d.xp as number) ?? 0), 0), members: docs.length }) };
        },
      }),
      doc: (id: string) => ({ get: async () => ({ exists: id in participants, data: () => participants[id] }) }),
    };
  };
  const db = { collection: withEventScope((name: string) => query(name)) };
  return { db: db as unknown as Firestore, queries, participants };
}

const P = (alias: string, xp: number, minute: number | null, squad: string | null = null): Doc => ({
  alias,
  xp,
  credits: 0,
  squad,
  ...(minute === null ? {} : { xpReachedAt: { toDate: () => at(minute) } }),
});

describe("FirestoreRankingSource", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let source: InstanceType<typeof FirestoreRankingSource>;
  beforeEach(() => {
    fake = fakeFirestore({
      u1: P("Nova", 500, 30, "firebase"),
      u2: P("Orion", 300, 20, "angular"),
      u3: P("Lyra", 300, 5, "angular"),
      u4: P("Vega", 300, 10),
      u5: P("Altair", 100, 1, "firebase"),
      u6: P("Cero", 0, null, "firebase"),
    });
    source = new FirestoreRankingSource(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reads the top with the whole tied block at its edge, in ranking order", async () => {
    // A document without an alias is never ranked, and does not cut the top short.
    fake = fakeFirestore({ ...fake.participants, broken: { xp: 900 } });
    source = new FirestoreRankingSource(() => fake.db, testEventResolver);

    const top = await source.top(4);

    // Orion, Lyra and Vega tie at 300: the two who reached it first make the cut.
    expect(top.ok && top.value.map((e) => e.alias)).toEqual(["Nova", "Lyra", "Vega", "Orion"]);
    expect(fake.queries).toEqual(["get  order:xp limit:4", "get xp==300"]);
  });

  it("keeps only the first places of a tied block", async () => {
    const top = await source.top(3);

    expect(top.ok && top.value.map((e) => e.alias)).toEqual(["Nova", "Lyra", "Vega"]);
    expect(top.ok && top.value[0]).toEqual({ uid: "u1", alias: "Nova", squadId: "firebase", xp: 500, reachedAt: at(30) });
  });

  it("reads once when there are fewer cadets with XP than places, leaving out those without XP or an alias", async () => {
    const top = await source.top(10);

    expect(top.ok && top.value.map((e) => e.alias)).toEqual(["Nova", "Lyra", "Vega", "Orion", "Altair"]);
    expect(fake.queries).toHaveLength(1);
  });

  it("counts who is ahead: more XP, or the same XP reached earlier", async () => {
    expect(await source.placeOf("u2")).toEqual(ok({ xp: 300, ahead: 3 }));
    expect(await source.placeOf("u3")).toEqual(ok({ xp: 300, ahead: 1 }));
    expect(await source.placeOf("u1")).toEqual(ok({ xp: 500, ahead: 0 }));
  });

  it("gives a cadet without XP no one ahead, and an unknown cadet no place", async () => {
    expect(await source.placeOf("u6")).toEqual(ok({ xp: 0, ahead: 0 }));
    expect(await source.placeOf("ghost")).toEqual(ok(null));
  });

  it("counts only more XP for a cadet whose moment is unknown", async () => {
    fake = fakeFirestore({ a: P("A", 300, 1), b: P("B", 300, null), c: P("C", 400, 2) });
    source = new FirestoreRankingSource(() => fake.db, testEventResolver);

    expect(await source.placeOf("b")).toEqual(ok({ xp: 300, ahead: 1 }));
  });

  it("counts every registered cadet and sums each squad's members", async () => {
    expect(await source.total()).toEqual(ok(6));
    expect(await source.squadTotals(["firebase", "angular", "gemini"])).toEqual(
      ok(
        new Map([
          ["firebase", { xp: 600, members: 3 }],
          ["angular", { xp: 600, members: 2 }],
          ["gemini", { xp: 0, members: 0 }],
        ]),
      ),
    );
  });

  it("reports failed reads", async () => {
    const broken = new FirestoreRankingSource(() => {
      throw new Error("down");
    }, testEventResolver);

    for (const call of [() => broken.top(10), () => broken.placeOf("u1"), () => broken.total(), () => broken.squadTotals(["a"])]) {
      expect(await call()).toEqual(err({ code: "unknown" }));
    }
  });
});
