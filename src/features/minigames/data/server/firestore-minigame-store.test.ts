import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { MinigamePlay } from "../../domain/plays";
import { DEFAULT_MINIGAME_SETTINGS } from "../../domain/settings";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreMinigameStore } = await import("./firestore-minigame-store");

type Doc = Record<string, unknown>;
const T0 = new Date("2026-10-24T15:00:00Z");
const PLAY: MinigamePlay = { uid: "u1", missionId: "ai-quiz", gameId: "circuits", difficulty: "normal", status: "started", xpBonus: 40, startedAt: T0, expiresAt: new Date(T0.getTime() + 170_000), finishedAt: null };
const PATH = "events/e1/minigamePlays/u1_ai-quiz";

/** A slice of Firestore whose transactions refuse a read after a write, as the real one does. */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop(), data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        id,
        path: `${name}/${id}`,
        get: async () => snapshot(`${name}/${id}`),
        set: async (data: Doc) => void store.set(`${name}/${id}`, data),
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => {
          if (pending.length > 0) throw new Error("reads must come before writes");
          return snapshot(ref.path);
        },
        create: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreMinigameStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreMinigameStore>;
  beforeEach(() => {
    fake = fakeFirestore({});
    store = new FirestoreMinigameStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("plays", () => {
    it("creates the ticket once and hands the stored one back after that", async () => {
      expect(await store.start(PLAY)).toEqual(ok({ play: PLAY, created: true }));
      expect(fake.store.get(PATH)).toEqual({ ...PLAY });
      expect(await store.start({ ...PLAY, startedAt: new Date() })).toEqual(ok({ play: PLAY, created: false }));
    });

    it("finds a play, reading Firestore timestamps, and nothing for one never started", async () => {
      fake.store.set(PATH, { ...PLAY, startedAt: { toDate: () => T0 }, expiresAt: { toDate: () => PLAY.expiresAt } });

      expect(await store.find("u1", "ai-quiz")).toEqual(ok(PLAY));
      expect(await store.find("u1", "other")).toEqual(ok(null));
    });

    it("reads a broken play as missing, and refuses to start over one", async () => {
      fake.store.set(PATH, { ...PLAY, status: "cheated" });

      expect(await store.find("u1", "ai-quiz")).toEqual(ok(null));
      expect(await store.start(PLAY)).toEqual(err({ code: "unknown" }));
      expect(fake.store.get(PATH)?.status).toBe("cheated");
    });

    it("finishes in a transaction, writing only the state and the time", async () => {
      fake.store.set(PATH, { ...PLAY });
      const finishedAt = new Date(T0.getTime() + 30_000);

      const result = await store.finish("u1", "ai-quiz", (current) => (current ? { ...current, status: "won", finishedAt, xpBonus: 999 } : null));

      expect(result).toEqual(ok({ ...PLAY, status: "won", finishedAt, xpBonus: 999 }));
      expect(fake.store.get(PATH)).toEqual({ ...PLAY, status: "won", finishedAt });
    });

    it("answers the stored play when the decision changes nothing, and null without one", async () => {
      fake.store.set(PATH, { ...PLAY, status: "lost", finishedAt: T0 });

      expect(await store.finish("u1", "ai-quiz", () => null)).toEqual(ok({ ...PLAY, status: "lost", finishedAt: T0 }));
      expect(await store.finish("u1", "other", () => null)).toEqual(ok(null));
    });

    it("works inside the active edition only", async () => {
      fake.store.set(PATH, { ...PLAY });
      const next = new FirestoreMinigameStore(() => fake.db, async () => "e2");

      expect(await next.find("u1", "ai-quiz")).toEqual(ok(null));
    });
  });

  describe("settings", () => {
    it("reads none until saved, then the saved ones", async () => {
      expect(await store.read()).toEqual(ok(null));

      const settings = { ...DEFAULT_MINIGAME_SETTINGS, codeLanguages: ["python" as const] };
      expect(await store.save(settings)).toEqual(ok(undefined));
      expect(fake.store.get("events/e1/config/minigames")).toMatchObject({ codeLanguages: ["python"], updatedAt: expect.any(Date) });
      expect(await store.read()).toEqual(ok(settings));
    });

    it("reads settings that break the rules as none (and logs it)", async () => {
      fake.store.set("events/e1/config/minigames", { games: {} });

      expect(await store.read()).toEqual(ok(null));
      expect(console.error).toHaveBeenCalled();
    });
  });

  it("reports failures as unknown", async () => {
    const broken = new FirestoreMinigameStore(() => {
      throw new Error("offline");
    }, testEventResolver);

    expect(await broken.find("u1", "x")).toEqual(err({ code: "unknown" }));
    expect(await broken.start(PLAY)).toEqual(err({ code: "unknown" }));
    expect(await broken.finish("u1", "x", () => null)).toEqual(err({ code: "unknown" }));
    expect(await broken.read()).toEqual(err({ code: "unknown" }));
    expect(await broken.save(DEFAULT_MINIGAME_SETTINGS)).toEqual(err({ code: "unknown" }));
  });
});
