import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withEventScope, testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreAttendeeRepository } = await import("./firestore-attendee-repository");

type Doc = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of Firestore the repository uses. It checks the repository's
 * logic (branching, atomic creation); real Firestore semantics need the emulator.
 */
function fakeFirestore() {
  const store = new Map<string, Doc>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  const ref = (collection: string, id: string) => ({ collection, id });
  const snapshot = (collection: string, id: string) => {
    const stored = store.get(key(collection, id));
    // Firestore returns dates as Timestamps (objects with toDate()), not as JS Dates.
    const data = stored && Object.fromEntries(
      Object.entries(stored).map(([name, value]) => [name, value instanceof Date ? { toDate: () => value } : value]),
    );
    return { exists: data !== undefined, data: () => data };
  };

  const db = {
    collection: withEventScope((collection: string) => ({
      doc: (id: string) => ({
        ...ref(collection, id),
        get: async () => snapshot(collection, id),
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (r: { collection: string; id: string }) => snapshot(r.collection, r.id),
        create: (r: { collection: string; id: string }, data: Doc) => {
          if (store.has(key(r.collection, r.id))) throw new Error("ALREADY_EXISTS");
          writes.push(() => store.set(key(r.collection, r.id), data));
        },
      };
      const result = await fn(tx);
      writes.forEach((write) => write()); // commit only if the callback finished
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const NOW = new Date("2026-10-04T12:00:00Z");
const attendeeFor = (uid: string, alias: string) => ({
  attendee: { uid, alias, role: "attendee" as const, squad: null, xp: 0, credits: 0, createdAt: NOW },
  alias: { display: alias, key: alias.toLowerCase() },
});

describe("FirestoreAttendeeRepository", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let repository: InstanceType<typeof FirestoreAttendeeRepository>;

  beforeEach(() => {
    fake = fakeFirestore();
    repository = new FirestoreAttendeeRepository(() => fake.db, testEventResolver);
  });

  it("keeps editions apart: the same account and alias can register again in a new edition", async () => {
    const first = attendeeFor("u1", "Nova_7");
    await repository.register(first.attendee, first.alias);
    const nextEdition = new FirestoreAttendeeRepository(() => fake.db, async () => "e2");

    expect(await nextEdition.findByUid("u1")).toEqual({ ok: true, value: null });
    const again = await nextEdition.register(first.attendee, first.alias);

    expect(again).toEqual({ ok: true, value: { kind: "created" } });
    expect(fake.store.has("events/e1/participants/u1")).toBe(true);
    expect(fake.store.has("events/e2/participants/u1")).toBe(true);
    expect(fake.store.has("events/e2/aliases/nova_7")).toBe(true);
  });

  it("creates the profile and the alias reservation together", async () => {
    const { attendee, alias } = attendeeFor("u1", "Nova_7");

    const result = await repository.register(attendee, alias);

    expect(result).toEqual({ ok: true, value: { kind: "created" } });
    expect(fake.store.get("events/e1/participants/u1")).toMatchObject({ alias: "Nova_7", aliasLower: "nova_7", role: "attendee", xp: 0, credits: 0 });
    expect(fake.store.get("events/e1/aliases/nova_7")).toMatchObject({ uid: "u1" });
  });

  it("rejects an alias owned by someone else (case-insensitively) and writes nothing", async () => {
    const first = attendeeFor("u1", "Nova_7");
    await repository.register(first.attendee, first.alias);
    const second = attendeeFor("u2", "NOVA_7");

    const result = await repository.register(second.attendee, second.alias);

    expect(result).toEqual({ ok: false, error: { code: "alias-taken" } });
    expect(fake.store.has("events/e1/participants/u2")).toBe(false);
  });

  it("is safe to retry: an existing uid resolves already-registered with the stored profile", async () => {
    const first = attendeeFor("u1", "Nova_7");
    await repository.register(first.attendee, first.alias);
    const retry = attendeeFor("u1", "SomethingElse");

    const result = await repository.register(retry.attendee, retry.alias);

    expect(result.ok && result.value.kind).toBe("already-registered");
    expect(result.ok && result.value.kind === "already-registered" && result.value.attendee.alias).toBe("Nova_7");
    expect(fake.store.has("events/e1/aliases/somethingelse")).toBe(false);
  });

  it("reports a corrupted stored profile as unknown rather than guessing", async () => {
    fake.store.set("events/e1/participants/u1", { alias: "Broken" });
    const retry = attendeeFor("u1", "Nova_7");

    expect(await repository.register(retry.attendee, retry.alias)).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("returns null for a user that has not onboarded and the profile once they have", async () => {
    expect(await repository.findByUid("u1")).toEqual({ ok: true, value: null });

    const { attendee, alias } = attendeeFor("u1", "Nova_7");
    await repository.register(attendee, alias);

    const found = await repository.findByUid("u1");
    expect(found.ok && found.value?.alias).toBe("Nova_7");
  });

  it("maps infrastructure failures to unknown", async () => {
    const broken = new FirestoreAttendeeRepository(() => {
      throw new Error("no credentials");
    });
    const { attendee, alias } = attendeeFor("u1", "Nova_7");

    expect(await broken.findByUid("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.register(attendee, alias)).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
