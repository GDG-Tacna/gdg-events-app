import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { CHUNK_BYTES, FirestoreImageStore, imageDocId, publicImageUrl } = await import("./firestore-image-store");

const PATH = "public/devfest-2026/venue-plan/0f8e2c1a-1111-4222-8333-944455551111.svg";

/** An in-memory Firestore with documents, subcollections and all-or-nothing batches. */
function fakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  const commits: string[][] = [];
  const doc = (path: string): unknown => ({
    path,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });
  const collection = (path: string) => ({ doc: (id: string) => doc(`${path}/${id}`) });
  const db = {
    collection,
    batch: () => {
      const ops: Array<() => void> = [];
      const names: string[] = [];
      return {
        create: (ref: { path: string }, data: Record<string, unknown>) => {
          names.push(`create ${ref.path}`);
          ops.push(() => {
            if (store.has(ref.path)) throw Object.assign(new Error("exists"), { code: 6 });
            store.set(ref.path, data);
          });
        },
        delete: (ref: { path: string }) => {
          names.push(`delete ${ref.path}`);
          ops.push(() => store.delete(ref.path));
        },
        commit: async () => {
          commits.push(names);
          for (const op of ops) op();
        },
      };
    },
  } as unknown as Firestore;
  return { db, store, commits };
}

describe("FirestoreImageStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let images: InstanceType<typeof FirestoreImageStore>;

  beforeEach(() => {
    fake = fakeFirestore();
    images = new FirestoreImageStore(() => fake.db);
  });

  it("serves images from the app's own route, under an id without slashes", () => {
    expect(publicImageUrl(PATH)).toBe(`/media/${PATH}`);
    expect(imageDocId(PATH)).toBe("public~devfest-2026~venue-plan~0f8e2c1a-1111-4222-8333-944455551111.svg");
  });

  it("keeps a small image in one document and reads it back with its type", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    expect(await images.put(PATH, bytes, "image/svg+xml")).toEqual({ ok: true, value: { url: `/media/${PATH}` } });
    expect(fake.store.get(`images/${imageDocId(PATH)}`)).toMatchObject({ path: PATH, contentType: "image/svg+xml", size: 4, chunks: 0 });
    expect(await images.get(PATH)).toEqual({ ok: true, value: { bytes, contentType: "image/svg+xml" } });
  });

  it("splits a large image into chunks written in one batch, and puts it back together in order", async () => {
    const bytes = new Uint8Array(CHUNK_BYTES * 2 + 10);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;

    await images.put(PATH, bytes, "image/svg+xml");

    expect(fake.commits).toHaveLength(1);
    expect(fake.commits[0]).toHaveLength(4);
    expect(fake.store.get(`images/${imageDocId(PATH)}`)).toMatchObject({ chunks: 3, size: bytes.length });
    expect(fake.store.get(`images/${imageDocId(PATH)}`)).not.toHaveProperty("data");
    const read = await images.get(PATH);
    expect(read.ok && read.value && Buffer.from(read.value.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("answers null for a missing image, and for one that lost a chunk", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await images.get(PATH)).toEqual({ ok: true, value: null });

    await images.put(PATH, new Uint8Array(CHUNK_BYTES + 1), "image/webp");
    fake.store.delete(`images/${imageDocId(PATH)}/chunks/1`);
    expect(await images.get(PATH)).toEqual({ ok: true, value: null });
  });

  it("removes an image with all its chunks, and a missing one quietly", async () => {
    await images.put(PATH, new Uint8Array(CHUNK_BYTES + 1), "image/webp");

    expect(await images.remove(PATH)).toEqual({ ok: true, value: undefined });
    expect(fake.store.size).toBe(0);
    expect(await images.remove(PATH)).toEqual({ ok: true, value: undefined });
  });

  it("never overwrites a name already taken, and reports failures without details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await images.put(PATH, new Uint8Array([1]), "image/webp");

    expect(await images.put(PATH, new Uint8Array([2]), "image/webp")).toEqual({ ok: false, error: { code: "unknown" } });
    const broken = new FirestoreImageStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore);
    expect(await broken.get(PATH)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.remove(PATH)).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
