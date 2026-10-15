import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreQuadrantStore } = await import("./firestore-quadrant-store");

type Doc = Record<string, unknown>;

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
      doc: (id: string) => ({ get: async () => snapshot(`${name}/${id}`) }),
    })),
  };
  return db as unknown as Firestore;
}

const quadrant = (name: string, order: number, extra: Doc = {}) => ({ name, tagline: "Lema", planet: "cloud", order, active: true, ...extra });
const PLAN = {
  width: 100,
  height: 100,
  areas: [{ id: "cloud-1", kind: "stand", label: "Stand", quadrantId: "cloud", rect: { x: 0, y: 0, width: 10, height: 10 } }],
};

describe("FirestoreQuadrantStore", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reads the edition's quadrants and plan, skipping malformed quadrants (and inactive unless marked active)", async () => {
    const db = fakeFirestore({
      "events/e1/quadrants/cloud": quadrant("Google Cloud", 0),
      "events/e1/quadrants/ai": quadrant("AI", 1, { active: false, planet: "ai" }),
      "events/e1/quadrants/no-order": quadrant("Sin orden", 0, { order: "x", active: undefined }),
      "events/e1/quadrants/moon": quadrant("Luna", 2, { planet: "moon" }),
      "events/e1/quadrants/nameless": { tagline: "x", planet: "cloud" },
      "events/e1/quadrants/Bad Id": quadrant("Mal", 3),
      "events/e1/venue/map": PLAN,
      "events/other/quadrants/firebase": quadrant("Firebase", 0),
    });

    const result = await new FirestoreQuadrantStore(() => db, testEventResolver).load();

    expect(result.ok && result.value.quadrants).toEqual([
      { id: "cloud", name: "Google Cloud", tagline: "Lema", planet: "cloud", order: 0, active: true },
      { id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 1, active: false },
      { id: "no-order", name: "Sin orden", tagline: "Lema", planet: "cloud", order: Number.MAX_SAFE_INTEGER, active: false },
    ]);
    expect(result.ok && result.value.venue).toEqual(PLAN);
  });

  it("reads nothing saved as an empty layout", async () => {
    const result = await new FirestoreQuadrantStore(() => fakeFirestore({}), testEventResolver).load();

    expect(result).toEqual({ ok: true, value: { quadrants: [], venue: null } });
  });

  it("reads a plan that cannot be drawn as missing, and logs it", async () => {
    const db = fakeFirestore({ "events/e1/venue/map": { ...PLAN, width: 5 } });

    const result = await new FirestoreQuadrantStore(() => db, testEventResolver).load();

    expect(result.ok && result.value.venue).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("reports a failed read", async () => {
    const db = { collection: () => { throw new Error("offline"); } } as unknown as Firestore;

    expect(await new FirestoreQuadrantStore(() => db, testEventResolver).load()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
