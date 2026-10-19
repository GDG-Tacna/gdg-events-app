import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreAttemptLimiter } = await import("./firestore-attempt-limiter");

type Doc = Record<string, unknown>;

/** Documents and transactions run one at a time, like Firestore retrying a contended one. */
function fakeFirestore() {
  const store = new Map<string, Doc>();
  let queue = Promise.resolve();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    runTransaction: <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = queue.then(() =>
        fn({
          get: async (ref: { path: string }) => ({ data: () => store.get(ref.path) }),
          set: (ref: { path: string }, data: Doc) => void store.set(ref.path, data),
        }),
      );
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreAttemptLimiter", () => {
  let clock: number;
  let fake: ReturnType<typeof fakeFirestore>;
  const limiter = () => new FirestoreAttemptLimiter({ scope: "mission-answer", maxAttempts: 3, windowMs: 60_000, now: () => clock, getDb: () => fake.db });

  beforeEach(() => {
    clock = 1_000_000;
    fake = fakeFirestore();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("allows the window's attempts and refuses the rest, counted for every server instance at once", async () => {
    const [one, two] = [limiter(), limiter()];

    const answers = await Promise.all([one.consume("uid-ana"), two.consume("uid-ana"), one.consume("uid-ana"), two.consume("uid-ana")]);

    expect(answers).toEqual([true, true, true, false]);
    expect(fake.store.get("rateLimits/mission-answer_uid-ana")).toEqual({ windowStart: 1_000_000, count: 3 });
  });

  it("starts a new window once the old one is over, and counts each person on their own", async () => {
    const shared = limiter();
    for (let i = 0; i < 3; i += 1) await shared.consume("uid-ana");

    expect(await shared.consume("uid-bruno")).toBe(true);
    expect(await shared.consume("uid-ana")).toBe(false);
    clock += 60_000;
    expect(await shared.consume("uid-ana")).toBe(true);
  });

  it("lets the attempt through and logs it when Firestore fails", async () => {
    const broken = new FirestoreAttemptLimiter({ scope: "mission-answer", maxAttempts: 1, windowMs: 60_000, getDb: () => ({ collection: () => { throw new Error("down"); } }) as unknown as Firestore });

    expect(await broken.consume("uid-ana")).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});
