import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreCompletionStore } = await import("./firestore-completion-store");

type Doc = Record<string, unknown>;
const NOW = new Date("2026-10-24T15:00:00Z");

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      where: (field: string, op: "==" | "!=", value: unknown) => ({
        get: async () => ({
          docs: [...store.entries()]
            .filter(([key, doc]) => key.startsWith(`${name}/`) && (op === "==" ? doc[field] === value : doc[field] !== value))
            .map(([key]) => snapshot(key)),
        }),
      }),
      doc: (id: string) => ({ path: `${name}/${id}` }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => snapshot(ref.path),
        set: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const stored = (uid: string, missionId: string, extra: Doc = {}) => ({ uid, missionId, status: "in-progress", attempts: 1, xpEarned: 0, at: { toDate: () => new Date(0) }, ...extra });

describe("FirestoreCompletionStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreCompletionStore>;

  beforeEach(() => {
    fake = fakeFirestore({
      "events/e1/missionCompletions/u1_quiz-1": stored("u1", "quiz-1"),
      "events/e1/missionCompletions/u1_kw-1": stored("u1", "kw-1", { status: "completed", attempts: 0, xpEarned: 40, creditsEarned: 0, at: new Date(5) }),
      "events/e1/missionCompletions/u1_bad": stored("u1", "bad", { status: "lost" }),
      "events/e1/missionCompletions/u2_quiz-1": stored("u2", "quiz-1"),
    });
    store = new FirestoreCompletionStore(() => fake.db, testEventResolver, () => NOW);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lists one attendee's completions, skipping malformed ones", async () => {
    const result = await store.listFor("u1");

    expect(result.ok && result.value).toEqual([
      { uid: "u1", missionId: "quiz-1", status: "in-progress", attempts: 1, xpEarned: 0, creditsEarned: 0, at: new Date(0) },
      { uid: "u1", missionId: "kw-1", status: "completed", attempts: 0, xpEarned: 40, creditsEarned: 0, at: new Date(5) },
    ]);
  });

  it("decides on the stored state and stores the next one", async () => {
    const decide = vi.fn(() => ({ kind: "next", status: "completed", attempts: 1, xpEarned: 20, creditsEarned: 2 }) as const);

    const result = await store.apply("u1", "quiz-1", decide);

    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ status: "in-progress", attempts: 1 }));
    const after = { uid: "u1", missionId: "quiz-1", status: "completed", attempts: 1, xpEarned: 20, creditsEarned: 2, at: NOW };
    expect(result.ok && result.value.after).toEqual(after);
    expect(fake.store.get("events/e1/missionCompletions/u1_quiz-1")).toEqual(after);
  });

  it("starts from nothing for a first answer", async () => {
    const decide = vi.fn(() => ({ kind: "next", status: "in-progress", attempts: 1, xpEarned: 0, creditsEarned: 0 }) as const);

    const result = await store.apply("u3", "quiz-1", decide);

    expect(decide).toHaveBeenCalledWith(null);
    expect(result.ok && result.value.before).toBeNull();
    expect(fake.store.has("events/e1/missionCompletions/u3_quiz-1")).toBe(true);
  });

  it("writes nothing when the decision changes nothing", async () => {
    const result = await store.apply("u1", "kw-1", () => ({ kind: "closed" }));

    expect(result.ok && result.value.after).toEqual(result.ok && result.value.before);
    expect(fake.store.get("events/e1/missionCompletions/u1_kw-1")?.at).toEqual(new Date(5));
  });

  it("reports a failed read or write", async () => {
    const broken = new FirestoreCompletionStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.listFor("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.apply("u1", "quiz-1", () => ({ kind: "closed" }))).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
