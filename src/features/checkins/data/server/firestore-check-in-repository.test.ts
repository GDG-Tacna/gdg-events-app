import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withEventScope, testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreCheckInRepository } = await import("./firestore-check-in-repository");

type Doc = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of Firestore the repository uses: reads and writes share one
 * transaction, `create` fails when the document exists (as the real one does). Real transaction
 * semantics (retries, contention) need the emulator.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const writes: Array<{ op: "create" | "update"; path: string; data: Doc }> = [];

  const db = {
    collection: withEventScope((collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}` }) })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        create: (ref: { path: string }, data: Doc) => {
          if (store.has(ref.path)) throw new Error("ALREADY_EXISTS");
          pending.push(() => {
            store.set(ref.path, data);
            writes.push({ op: "create", path: ref.path, data });
          });
        },
        update: (ref: { path: string }, data: Doc) => {
          if (!store.has(ref.path)) throw new Error("NOT_FOUND");
          pending.push(() => {
            store.set(ref.path, { ...store.get(ref.path), ...data });
            writes.push({ op: "update", path: ref.path, data });
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

const AT = new Date("2026-10-20T14:00:00Z");
const talk = { id: "talk-1", kind: "talk", name: "Keynote", active: true } as const;
const entrance = { id: "entrance-main", kind: "entrance", name: "Entrada", active: true } as const;
const catering = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true } as const;

describe("FirestoreCheckInRepository", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let repository: InstanceType<typeof FirestoreCheckInRepository>;

  const setup = (docs: Record<string, Doc>) => {
    fake = fakeFirestore(docs);
    repository = new FirestoreCheckInRepository(() => fake.db, testEventResolver);
  };

  beforeEach(() => {
    setup({ "events/e1/participants/u1": { alias: "Nova_7", xp: 0 } });
  });

  it("stores the check-in under the deterministic id", async () => {
    const result = await repository.record({ uid: "u1", checkpoint: talk, at: AT });

    expect(result).toEqual({ ok: true, value: { kind: "recorded", firstEntrance: false } });
    expect(fake.writes).toEqual([
      { op: "create", path: "events/e1/checkins/u1_talk-1", data: { uid: "u1", checkpointId: "talk-1", kind: "talk", at: AT } },
    ]);
  });

  it("is idempotent: a second scan of the same checkpoint writes nothing", async () => {
    await repository.record({ uid: "u1", checkpoint: talk, at: AT });
    fake.writes.length = 0;

    const again = await repository.record({ uid: "u1", checkpoint: talk, at: new Date("2026-10-20T15:00:00Z") });

    expect(again).toEqual({ ok: true, value: { kind: "already-recorded" } });
    expect(fake.writes).toEqual([]);
    expect((fake.store.get("events/e1/checkins/u1_talk-1") as Doc).at).toEqual(AT);
  });

  it("keeps a separate record for each checkpoint", async () => {
    await repository.record({ uid: "u1", checkpoint: talk, at: AT });
    const other = await repository.record({ uid: "u1", checkpoint: catering, at: AT });

    expect(other).toEqual({ ok: true, value: { kind: "recorded", firstEntrance: false } });
    expect(fake.store.has("events/e1/checkins/u1_talk-1")).toBe(true);
    expect(fake.store.has("events/e1/checkins/u1_lunch-1")).toBe(true);
  });

  it("registers the attendee at the event on the first entrance, writing only attendedAt", async () => {
    const result = await repository.record({ uid: "u1", checkpoint: entrance, at: AT });

    expect(result).toEqual({ ok: true, value: { kind: "recorded", firstEntrance: true } });
    expect(fake.writes).toContainEqual({ op: "update", path: "events/e1/participants/u1", data: { attendedAt: AT } });
    expect(fake.store.get("events/e1/participants/u1")).toMatchObject({ alias: "Nova_7", xp: 0, attendedAt: AT });
  });

  it("does not move attendedAt when another entrance is scanned later", async () => {
    setup({ "events/e1/participants/u1": { alias: "Nova_7", attendedAt: AT } });

    const result = await repository.record({
      uid: "u1",
      checkpoint: { id: "entrance-side", kind: "entrance", name: "Entrada lateral", active: true },
      at: new Date("2026-10-20T18:00:00Z"),
    });

    expect(result).toEqual({ ok: true, value: { kind: "recorded", firstEntrance: false } });
    expect(fake.writes.filter((w) => w.path === "events/e1/participants/u1")).toEqual([]);
    expect((fake.store.get("events/e1/participants/u1") as Doc).attendedAt).toEqual(AT);
  });

  it("never stamps attendedAt for talks or catering", async () => {
    await repository.record({ uid: "u1", checkpoint: talk, at: AT });
    await repository.record({ uid: "u1", checkpoint: catering, at: AT });

    expect(fake.store.get("events/e1/participants/u1")).not.toHaveProperty("attendedAt");
  });

  it("refuses a user without a profile and stores nothing", async () => {
    const result = await repository.record({ uid: "ghost", checkpoint: entrance, at: AT });

    expect(result).toEqual({ ok: false, error: { code: "not-registered" } });
    expect(fake.writes).toEqual([]);
  });

  it("works inside the active edition only: the same attendee must register again in a new one", async () => {
    await repository.record({ uid: "u1", checkpoint: entrance, at: AT });
    const nextEdition = new FirestoreCheckInRepository(() => fake.db, async () => "e2");

    const result = await nextEdition.record({ uid: "u1", checkpoint: entrance, at: AT });

    expect(result).toEqual({ ok: false, error: { code: "not-registered" } });
    expect([...fake.store.keys()].filter((key) => key.startsWith("events/e2/"))).toEqual([]);
    expect(fake.store.has("events/e1/checkins/u1_entrance-main")).toBe(true);
  });

  it("turns an unexpected failure into an unknown error", async () => {
    const failing = new FirestoreCheckInRepository(() => {
      throw new Error("boom");
    }, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await failing.record({ uid: "u1", checkpoint: talk, at: AT })).toEqual({
      ok: false,
      error: { code: "unknown" },
    });
  });
});
