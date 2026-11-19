import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreRundownStore } = await import("./firestore-rundown-store");

const SLIDES = { id: "cue-0001", kind: "slides", name: "Keynote", path: "apertura/keynote.pdf" } as const;
const VIDEO = { id: "cue-0002", kind: "video", name: "Demo", path: "genkit/demo.mp4" } as const;

/** A document store that merges the nested map on set with merge, like Firestore does. */
function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
        set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
          const key = `${name}/${id}`;
          const before = options?.merge ? (store.get(key) ?? {}) : {};
          const items = { ...((before.items as object | undefined) ?? {}), ...((data.items as object | undefined) ?? {}) };
          // The minutes merge key by key, and a key set to the delete marker is taken out, like Firestore does.
          const minutes = Object.fromEntries(Object.entries({ ...((before.minutes as object | undefined) ?? {}), ...((data.minutes as object | undefined) ?? {}) }).filter(([, value]) => !FieldValue.delete().isEqual(value as FieldValue)));
          store.set(key, { ...before, ...data, items, ...(before.minutes || data.minutes ? { minutes } : {}) });
        },
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreRundownStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreRundownStore>;
  beforeEach(() => {
    fake = fakeFirestore();
    store = new FirestoreRundownStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reads nothing until a point has pieces, then the pieces as saved, each point apart", async () => {
    expect(await store.read()).toEqual(ok({}));

    await store.saveItem("keynote", [SLIDES]);
    await store.saveItem("genkit", [VIDEO]);

    expect(await store.read()).toEqual(ok({ keynote: [SLIDES], genkit: [VIDEO] }));
    // Only paths and names are stored.
    expect(fake.store.get("events/e1/config/rundown")?.items).toEqual({ keynote: [SLIDES], genkit: [VIDEO] });
  });

  it("replaces a point's pieces and clears them with an empty list, which then reads as none", async () => {
    await store.saveItem("keynote", [SLIDES, VIDEO]);
    await store.saveItem("keynote", [VIDEO]);
    expect(await store.read()).toEqual(ok({ keynote: [VIDEO] }));

    await store.saveItem("keynote", []);
    expect(await store.read()).toEqual(ok({}));
  });

  it("reads a point whose stored pieces break the rules as having none, without breaking the others", async () => {
    fake.store.set("events/e1/config/rundown", { items: { keynote: [SLIDES], roto: [{ ...VIDEO, path: "../fuera.mp4" }], raro: "no" } });

    expect(await store.read()).toEqual(ok({ keynote: [SLIDES] }));
  });

  it("stores a Google Slides piece with its presentation and no path, and reads it back", async () => {
    const deck = { id: "cue-0009", kind: "gslides", name: "Keynote", deckId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", published: true } as const;

    await store.saveItem("keynote", [SLIDES, deck]);

    expect(fake.store.get("events/e1/config/rundown")?.items).toEqual({ keynote: [SLIDES, deck] });
    expect(await store.read()).toEqual(ok({ keynote: [SLIDES, deck] }));
  });

  it("keeps the seconds of a piece, and only when it has them", async () => {
    await store.saveItem("keynote", [{ ...SLIDES, seconds: 15 }, VIDEO]);

    expect(fake.store.get("events/e1/config/rundown")?.items).toEqual({ keynote: [{ ...SLIDES, seconds: 15 }, VIDEO] });
    expect(await store.read()).toEqual(ok({ keynote: [{ ...SLIDES, seconds: 15 }, VIDEO] }));
  });

  it("stores the points made in the console as a whole and reads them back with the minutes planned", async () => {
    const cafe = { id: "cafe", title: "Café", who: "", time: "10:40" };
    const welcome = { id: "bienvenida", title: "Bienvenida", who: "GDG Tacna", time: "" };
    await store.savePoints([cafe, welcome]);
    await store.saveMinutes("keynote", 20);
    await store.saveMinutes("cafe", 15);

    expect(await store.readPlan()).toEqual(ok({ points: [cafe, welcome], minutes: { keynote: 20, cafe: 15 } }));

    await store.savePoints([welcome]);
    await store.saveMinutes("cafe", null);
    expect(await store.readPlan()).toEqual(ok({ points: [welcome], minutes: { keynote: 20 } }));
  });

  it("reads an edition with nothing planned as empty, and leaves out what breaks the rules", async () => {
    expect(await store.readPlan()).toEqual(ok({ points: [], minutes: {} }));

    fake.store.set("events/e1/config/rundown", { points: [{ id: "BAD", title: "x" }], minutes: { keynote: 20, cafe: -5, foo: "3" } });
    expect(await store.readPlan()).toEqual(ok({ points: [], minutes: { keynote: 20 } }));
    expect(console.error).toHaveBeenCalled();
  });

  it("reports a failed read or write", async () => {
    const broken = new FirestoreRundownStore(() => {
      throw new Error("down");
    }, testEventResolver);

    expect(await broken.read()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.saveItem("keynote", [SLIDES])).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
