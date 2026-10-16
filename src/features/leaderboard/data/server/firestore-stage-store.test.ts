import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import { DEFAULT_STAGE, type StageState } from "../../domain/stage";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreStageStore } = await import("./firestore-stage-store");

const AT = new Date("2026-10-24T22:40:00Z");
const PATH = "events/e1/config/stage";

function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>) => void store.set(`${name}/${id}`, data),
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreStageStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreStageStore>;
  beforeEach(() => {
    fake = fakeFirestore();
    store = new FirestoreStageStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("answers nothing until a stage is saved, then the stage as saved", async () => {
    expect(await store.read()).toEqual(ok(null));

    const state: StageState = {
      display: "reveal",
      view: "cadets",
      frozen: { cadets: [{ position: 1, alias: "Nova", squad: null, xp: 500 }], squads: [], at: AT },
      champions: { cadet: { position: 1, alias: "Nova", squad: null, xp: 500 }, squad: null },
      raffle: null,
      background: { path: "public/e1/stage-background/abcdef123456.webp", url: "/media/public/e1/stage-background/abcdef123456.webp" },
      poll: null,
    };
    await store.save(state);

    expect(fake.store.get(PATH)).toMatchObject({ display: "reveal", view: "cadets", frozen: { at: AT }, updatedAt: expect.any(Date) });
    expect(await store.read()).toEqual(ok(state));
  });

  it("saves plain copies, never the caller's own arrays", async () => {
    const cadets = [{ position: 1, alias: "Nova", squad: null, xp: 500 }];
    const champions = { cadet: cadets[0], squad: null };
    await store.save({ ...DEFAULT_STAGE, frozen: { cadets, squads: [], at: AT }, champions });

    expect((fake.store.get(PATH)?.frozen as { cadets: unknown }).cadets).not.toBe(cadets);
    expect(fake.store.get(PATH)?.champions).not.toBe(champions);
    expect(fake.store.get(PATH)?.champions).toEqual(champions);
  });

  it("treats a stage that breaks the rules as none, and says so in the log", async () => {
    fake.store.set(PATH, { display: "fireworks", view: "both" });

    expect(await store.read()).toEqual(ok(null));
    expect(console.error).toHaveBeenCalled();
  });

  it("reports failed reads and writes", async () => {
    const broken = new FirestoreStageStore(() => {
      throw new Error("down");
    }, testEventResolver);

    expect(await broken.read()).toEqual(err({ code: "unknown" }));
    expect(await broken.save(DEFAULT_STAGE)).toEqual(err({ code: "unknown" }));
  });
});
