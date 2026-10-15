import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Mission } from "../../domain/mission";

vi.mock("server-only", () => ({}));
vi.mock("@/features/media/server", () => ({
  imageRefOf: (path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null),
}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreMissionStore } = await import("./firestore-mission-store");

type Doc = Record<string, unknown>;

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
      doc: (id: string) => ({
        path: `${name}/${id}`,
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => snapshot(ref.path),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
    batch: () => {
      const pending: Array<() => void> = [];
      return {
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
        commit: async () => pending.forEach((write) => write()),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const QUIZ: Mission = {
  id: "ai-quiz",
  title: "Desafío AI",
  description: "",
  quadrantId: "ai",
  xp: 40,
  order: 0,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config: { type: "quiz", question: "¿Qué es Gemini?", options: ["Un modelo", "Un lenguaje"], answer: 0 },
};
const QUIZ_DOC: Omit<Mission, "id"> = { ...QUIZ };
delete (QUIZ_DOC as Partial<Mission>).id;

describe("FirestoreMissionStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreMissionStore>;

  beforeEach(() => {
    fake = fakeFirestore({ "events/e1/missions/ai-quiz": { ...QUIZ_DOC } });
    store = new FirestoreMissionStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates a mission with all its fields, and never over an existing id", async () => {
    const keyword: Mission = { ...QUIZ, id: "ai-kw", order: 1, minigame: "circuits", minigameDifficulty: "easy", config: { type: "keyword", prompt: "Pide la clave", keywords: ["red"] } };

    expect(await store.create(keyword)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/missions/ai-kw")).toMatchObject({ title: "Desafío AI", order: 1, active: true, minigame: "circuits", minigameDifficulty: "easy", config: keyword.config });
    expect(await store.list()).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ id: "ai-kw" })]) });

    expect(await store.create(QUIZ)).toEqual({ ok: false, error: { code: "already-exists" } });
  });

  it("updates only the given fields and reports the mission before and after", async () => {
    const result = await store.update("ai-quiz", { xp: 60, active: false });

    expect(result.ok && result.value).toEqual({ before: { ...QUIZ, image: null }, after: { ...QUIZ, image: null, xp: 60, active: false } });
    expect(fake.store.get("events/e1/missions/ai-quiz")).toMatchObject({ xp: 60, active: false, title: "Desafío AI" });
  });

  it("keeps the picture as its path and rebuilds its address when reading", async () => {
    const path = "public/e1/mission/0f8e2c1a-1111-4222-8333-944455551111.webp";
    await store.update("ai-quiz", { image: { path, url: "ignored" } });
    expect(fake.store.get("events/e1/missions/ai-quiz")).toMatchObject({ imagePath: path });
    expect(fake.store.get("events/e1/missions/ai-quiz")).not.toHaveProperty("image");

    expect(await store.list()).toMatchObject({ ok: true, value: [expect.objectContaining({ image: { path, url: `https://cdn/${path}` } })] });

    await store.update("ai-quiz", { image: null });
    expect(fake.store.get("events/e1/missions/ai-quiz")).toMatchObject({ imagePath: null });
  });

  it("saves and clears the G-Credits and the mini-game", async () => {
    await store.update("ai-quiz", { credits: 15, minigame: "circuits", minigameDifficulty: "hard" });
    expect(fake.store.get("events/e1/missions/ai-quiz")).toMatchObject({ credits: 15, minigame: "circuits", minigameDifficulty: "hard" });
    expect(await store.list()).toMatchObject({ ok: true, value: [expect.objectContaining({ minigame: "circuits", minigameDifficulty: "hard" })] });

    await store.update("ai-quiz", { credits: null, minigame: null, minigameDifficulty: null });
    expect(fake.store.get("events/e1/missions/ai-quiz")).toMatchObject({ credits: null, minigame: null, minigameDifficulty: null });
  });

  it("saves a new config as plain data", async () => {
    const config = { type: "quiz", question: "¿Qué es Firebase?", options: ["Plataforma", "Lenguaje", "Editor"], answer: 2 } as const;

    await store.update("ai-quiz", { config });

    expect(fake.store.get("events/e1/missions/ai-quiz")?.config).toEqual(config);
  });

  it("reads an unknown or unreadable mission as missing", async () => {
    fake.store.set("events/e1/missions/broken", { title: "x" });

    expect(await store.update("ghost", { xp: 10 })).toEqual({ ok: true, value: null });
    expect(await store.update("broken", { xp: 10 })).toEqual({ ok: true, value: null });
  });

  it("saves the order in one go", async () => {
    fake.store.set("events/e1/missions/ai-kw", { ...QUIZ_DOC, order: 5 });

    await store.setOrder(["ai-kw", "ai-quiz"]);

    expect(fake.store.get("events/e1/missions/ai-kw")?.order).toBe(0);
    expect(fake.store.get("events/e1/missions/ai-quiz")?.order).toBe(1);
  });

  it("reports failed writes", async () => {
    const broken = new FirestoreMissionStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.create(QUIZ)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.update("ai-quiz", { xp: 1 })).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.setOrder(["ai-quiz"])).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
