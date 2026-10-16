import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
vi.mock("@/features/media/server", () => ({ imageRefOf: (path: string) => ({ path, url: `/media/${path}` }) }));

const { FirestoreSpeakerStore, toSpeaker } = await import("./firestore-speaker-store");

type Doc = Record<string, unknown>;
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snap = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snap) }),
      doc: (id: string) => ({
        path: `${name}/${id}`,
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => snap(ref.path),
        update: (ref: { path: string }, data: Doc) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const ANA = {
  id: "ana-torres",
  name: "Ana Torres",
  headline: "GDE",
  bio: "",
  photo: { path: "public/e1/speaker/abcdef123456.webp", url: "/media/public/e1/speaker/abcdef123456.webp" },
  links: { linkedin: "https://linkedin.com/in/ana", github: null, web: null },
  active: true,
};

describe("FirestoreSpeakerStore", () => {
  it("reads a stored speaker, rebuilding the photo's address and ignoring links that are not https", () => {
    expect(toSpeaker("ana-torres", { name: "Ana Torres", headline: "GDE", photoPath: ANA.photo.path, links: { linkedin: "https://linkedin.com/in/ana", github: "javascript:x" } })).toEqual(ANA);
    expect(toSpeaker("ana-torres", { headline: "sin nombre" })).toBeNull();
    expect(toSpeaker("Bad Id", { name: "X" })).toBeNull();
  });

  it("creates a speaker once, storing the photo by its path, and lists it", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreSpeakerStore(() => fake.db, testEventResolver);

    expect(await store.create(ANA)).toEqual({ ok: true, value: undefined });
    expect(fake.store.get("events/e1/speakers/ana-torres")).toMatchObject({ name: "Ana Torres", photoPath: ANA.photo.path, active: true });
    expect(await store.list()).toEqual({ ok: true, value: [ANA] });
    expect(await store.create(ANA)).toEqual({ ok: false, error: { code: "already-exists" } });
  });

  it("updates only the fields given and answers null for an unknown speaker", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreSpeakerStore(() => fake.db, testEventResolver);
    await store.create(ANA);

    expect(await store.update("ana-torres", { photo: null, active: false })).toMatchObject({ ok: true, value: { after: { photo: null, active: false, name: "Ana Torres" } } });
    expect(fake.store.get("events/e1/speakers/ana-torres")).toMatchObject({ photoPath: null, active: false });
    expect(await store.update("ghost", { active: false })).toEqual({ ok: true, value: null });
  });
});
