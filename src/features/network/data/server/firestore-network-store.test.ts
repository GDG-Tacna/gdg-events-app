import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { ContactLinks } from "../../domain/links";
import type { Contact } from "../../domain/network";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreNetworkStore } = await import("./firestore-network-store");

type Doc = Record<string, unknown>;
const T0 = new Date("2026-10-24T15:00:00Z");
const CONTACT: Contact = { id: "uid-ana_uid-bruno", uids: ["uid-ana", "uid-bruno"], scannedBy: "uid-bruno", createdAt: T0 };

/** A slice of Firestore: documents, an array-contains query, getAll, and transactions that refuse a read after a write. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  let documentReads = 0;
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        id,
        path: `${name}/${id}`,
        get: async () => snapshot(`${name}/${id}`),
        set: async (data: Doc) => void store.set(`${name}/${id}`, data),
      }),
      where: (field: string, op: string, value: unknown) => {
        if (op !== "array-contains") throw new Error(`unexpected ${op}`);
        const matching = () =>
          [...store.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && Array.isArray(data[field]) && (data[field] as unknown[]).includes(value));
        return {
          get: async () => {
            documentReads += 1;
            return { docs: matching().map(([path, data]) => ({ id: path.split("/").pop()!, data: () => data })) };
          },
          count: () => ({ get: async () => ({ data: () => ({ count: matching().length }) }) }),
        };
      },
    })),
    getAll: async (...refs: Array<{ path: string }>) => refs.map((ref) => snapshot(ref.path)),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => {
          if (pending.length > 0) throw new Error("reads must come before writes");
          return snapshot(ref.path);
        },
        create: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
        set: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, data)),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store, documentReads: () => documentReads };
}

describe("FirestoreNetworkStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let store: InstanceType<typeof FirestoreNetworkStore>;
  beforeEach(() => {
    fake = fakeFirestore();
    store = new FirestoreNetworkStore(() => fake.db, testEventResolver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates a pair's contact once and hands the stored one back after that", async () => {
    expect(await store.connect(CONTACT)).toEqual(ok({ contact: CONTACT, created: true }));
    expect(fake.store.get("events/e1/contacts/uid-ana_uid-bruno")).toEqual({ uids: ["uid-ana", "uid-bruno"], scannedBy: "uid-bruno", createdAt: T0 });

    const later = { ...CONTACT, scannedBy: "uid-ana", createdAt: new Date(T0.getTime() + 60_000) };
    expect(await store.connect(later)).toEqual(ok({ contact: CONTACT, created: false }));
  });

  it("gives a cadet's paid slots to the first contacts up to the cap, and keeps a pair's slot on later scans", async () => {
    expect(await store.reserveRewardSlot("uid-ana", "uid-bruno", 2)).toEqual(ok(true));
    expect(await store.reserveRewardSlot("uid-ana", "uid-carla", 2)).toEqual(ok(true));
    expect(await store.reserveRewardSlot("uid-ana", "uid-dora", 2)).toEqual(ok(false));
    expect(await store.reserveRewardSlot("uid-ana", "uid-bruno", 2)).toEqual(ok(true));

    expect(fake.store.get("events/e1/contactRewards/uid-ana")).toEqual({ paid: ["uid-bruno", "uid-carla"] });
  });

  it("lists a cadet's contacts from either side, skipping broken ones", async () => {
    await store.connect(CONTACT);
    await store.connect({ id: "uid-bruno_uid-carla", uids: ["uid-bruno", "uid-carla"], scannedBy: "uid-carla", createdAt: T0 });
    // Not its own sorted pair: never trusted.
    fake.store.set("events/e1/contacts/uid-zed_uid-bruno", { uids: ["uid-zed", "uid-bruno"], scannedBy: "uid-zed", createdAt: T0 });
    fake.store.set("events/e1/contacts/uid-bruno_uid-dora", { uids: ["uid-bruno", "uid-dora"], scannedBy: "uid-dora" });

    const listed = await store.listFor("uid-bruno");

    expect(listed.ok && listed.value.map((contact) => contact.id)).toEqual(["uid-ana_uid-bruno", "uid-bruno_uid-carla"]);
    expect(await store.listFor("uid-carla")).toMatchObject({ ok: true, value: [{ id: "uid-bruno_uid-carla" }] });
  });

  it("counts a cadet's contacts from either side with an aggregation, without reading them", async () => {
    await store.connect(CONTACT);
    await store.connect({ id: "uid-bruno_uid-carla", uids: ["uid-bruno", "uid-carla"], scannedBy: "uid-carla", createdAt: T0 });

    expect(await store.countFor("uid-bruno")).toEqual(ok(2));
    expect(await store.countFor("uid-ana")).toEqual(ok(1));
    expect(await store.countFor("uid-nadie")).toEqual(ok(0));
    expect(fake.documentReads()).toBe(0);
  });

  it("reads a stored contact with a Firestore timestamp", async () => {
    fake.store.set("events/e1/contacts/uid-ana_uid-bruno", { uids: ["uid-ana", "uid-bruno"], scannedBy: "uid-ana", createdAt: { toDate: () => T0 } });

    expect(await store.listFor("uid-ana")).toEqual(ok([{ ...CONTACT, scannedBy: "uid-ana" }]));
  });

  it("refuses to hand back a broken contact as if it were new", async () => {
    fake.store.set("events/e1/contacts/uid-ana_uid-bruno", { uids: ["uid-ana"], scannedBy: "uid-ana", createdAt: T0 });

    expect(await store.connect(CONTACT)).toEqual(err({ code: "unknown" }));
  });

  it("saves and reads each cadet's links, none for a cadet who chose none", async () => {
    const links: ContactLinks = { linkedin: null, github: "https://github.com/ana", web: null };
    await store.saveLinks("uid-ana", links);

    expect(fake.store.get("events/e1/contactCards/uid-ana")).toMatchObject(links);
    expect(await store.linksOf(["uid-ana", "uid-bruno"])).toEqual(
      ok(
        new Map<string, ContactLinks>([
          ["uid-ana", links],
          ["uid-bruno", { linkedin: null, github: null, web: null }],
        ]),
      ),
    );
    expect(await store.linksOf([])).toEqual(ok(new Map()));
  });

  it("reports failed reads and writes", async () => {
    const broken = new FirestoreNetworkStore(() => {
      throw new Error("down");
    }, testEventResolver);

    for (const call of [() => broken.connect(CONTACT), () => broken.listFor("uid-ana"), () => broken.countFor("uid-ana"), () => broken.linksOf(["uid-ana"]), () => broken.saveLinks("uid-ana", { linkedin: null, github: null, web: null })]) {
      expect(await call()).toEqual(err({ code: "unknown" }));
    }
  });
});
