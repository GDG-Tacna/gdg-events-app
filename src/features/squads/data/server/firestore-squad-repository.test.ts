import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withEventScope, testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreSquadRepository } = await import("./firestore-squad-repository");

type Doc = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of Firestore the repository uses. It checks the branching and
 * that read and write share one transaction; real Firestore semantics need the emulator.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const updates: Array<{ path: string; data: Doc }> = [];

  const db = {
    collection: withEventScope((collection: string) => ({
      doc: (id: string) => ({ path: `${collection}/${id}` }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (ref: { path: string }) => {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        update: (ref: { path: string }, data: Doc) => {
          if (!store.has(ref.path)) throw new Error("NOT_FOUND");
          pending.push(() => {
            store.set(ref.path, { ...store.get(ref.path), ...data });
            updates.push({ path: ref.path, data });
          });
        },
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store, updates };
}

describe("FirestoreSquadRepository", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let repository: InstanceType<typeof FirestoreSquadRepository>;

  const setup = (users: Record<string, Doc>) => {
    fake = fakeFirestore(users);
    repository = new FirestoreSquadRepository(() => fake.db, testEventResolver);
  };

  beforeEach(() => {
    setup({ "events/e1/participants/u1": { alias: "Nova_7", squad: null, xp: 0 } });
  });

  it("works inside the active edition only: a profile of another edition is not touched or found", async () => {
    const otherEdition = new FirestoreSquadRepository(() => fake.db, async () => "e2");

    const result = await otherEdition.assignIfUnassigned("u1", "gemini");

    expect(result).toEqual({ ok: false, error: { code: "not-registered" } });
    expect(fake.updates).toEqual([]);
    expect(fake.store.get("events/e1/participants/u1")).toMatchObject({ squad: null });
  });

  it("assigns the squad to an attendee that has none and writes only that field", async () => {
    const result = await repository.assignIfUnassigned("u1", "cloud");

    expect(result).toEqual({ ok: true, value: { kind: "assigned", squad: "cloud" } });
    expect(fake.updates).toEqual([{ path: "events/e1/participants/u1", data: { squad: "cloud" } }]);
    expect(fake.store.get("events/e1/participants/u1")).toMatchObject({ alias: "Nova_7", xp: 0, squad: "cloud" });
  });

  it("keeps the stored squad and writes nothing when the attendee already has one", async () => {
    setup({ "events/e1/participants/u1": { alias: "Nova_7", squad: "firebase" } });

    const result = await repository.assignIfUnassigned("u1", "angular");

    expect(result).toEqual({ ok: true, value: { kind: "already-assigned", squad: "firebase" } });
    expect(fake.updates).toEqual([]);
  });

  it("keeps a squad that has since been retired: any well-formed squad id counts as assigned", async () => {
    // "cloud" was an event squad before Gemini replaced it; the attendee keeps it.
    setup({ "events/e1/participants/u1": { alias: "Nova_7", squad: "cloud" } });

    const result = await repository.assignIfUnassigned("u1", "gemini");

    expect(result).toEqual({ ok: true, value: { kind: "already-assigned", squad: "cloud" } });
    expect(fake.updates).toEqual([]);
  });

  it.each([["empty", ""], ["not a slug", "Not A Slug!"], ["a number", 7]])(
    "treats a malformed squad value (%s) as unassigned",
    async (_label, value) => {
      setup({ "events/e1/participants/u1": { alias: "Nova_7", squad: value } });

      const result = await repository.assignIfUnassigned("u1", "gemini");

      expect(result).toEqual({ ok: true, value: { kind: "assigned", squad: "gemini" } });
    },
  );

  it("is idempotent: a second call returns the first assignment", async () => {
    await repository.assignIfUnassigned("u1", "cloud");

    const second = await repository.assignIfUnassigned("u1", "angular");

    expect(second).toEqual({ ok: true, value: { kind: "already-assigned", squad: "cloud" } });
  });

  it("reports a user without a profile", async () => {
    expect(await repository.assignIfUnassigned("ghost", "cloud")).toEqual({
      ok: false,
      error: { code: "not-registered" },
    });
    expect(fake.updates).toEqual([]);
  });

  it("maps infrastructure failures to unknown", async () => {
    const broken = new FirestoreSquadRepository(() => {
      throw new Error("no credentials");
    });

    expect(await broken.assignIfUnassigned("u1", "cloud")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
