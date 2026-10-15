import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { IMAGES_COLLECTION, IMAGE_CHUNKS_COLLECTION } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { ImageStore } from "../../domain/image";

/** Firestore documents hold at most 1 MiB: bytes beyond this go to numbered chunk documents. */
export const CHUNK_BYTES = 900_000;

/** Document ids cannot contain "/": app image paths only use [a-z0-9-.] and "/", so "~" never clashes. */
export const imageDocId = (path: string) => path.replaceAll("/", "~");

/** Where the app serves an image from: its own `/media` route, which reads it here and caches it for good. */
export const publicImageUrl = (path: string): string => `/media/${path}`;

const toBytes = (value: unknown): Uint8Array | null => (value instanceof Uint8Array ? new Uint8Array(value) : null);

/**
 * Uploaded images kept in Firestore (Admin SDK, server only; clients are denied by the rules). An image up to
 * `CHUNK_BYTES` is one document; a larger one (a big venue plan) is split into `chunks/{n}` documents written in the
 * same batch as its header, so a half-written image is never read.
 */
export class FirestoreImageStore implements ImageStore {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<Result<{ url: string }, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(IMAGES_COLLECTION).doc(imageDocId(path));
      const batch = db.batch();
      const single = bytes.length <= CHUNK_BYTES;
      const chunks = single ? 0 : Math.ceil(bytes.length / CHUNK_BYTES);
      batch.create(ref, { path, contentType, size: bytes.length, chunks, ...(single ? { data: Buffer.from(bytes) } : {}), createdAt: new Date() });
      for (let index = 0; index < chunks; index += 1) {
        const part = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
        batch.create(ref.collection(IMAGE_CHUNKS_COLLECTION).doc(String(index)), { data: Buffer.from(part) });
      }
      await batch.commit();
      return ok({ url: publicImageUrl(path) });
    } catch (cause) {
      logServerError("media.put", cause);
      return err({ code: "unknown" });
    }
  }

  async get(path: string): Promise<Result<{ bytes: Uint8Array; contentType: string } | null, { code: string }>> {
    try {
      const ref = this.getDb().collection(IMAGES_COLLECTION).doc(imageDocId(path));
      const snapshot = await ref.get();
      if (!snapshot.exists) return ok(null);
      const data = snapshot.data() ?? {};
      const contentType = typeof data.contentType === "string" ? data.contentType : "application/octet-stream";
      const chunks = typeof data.chunks === "number" ? data.chunks : 0;
      if (chunks === 0) {
        const bytes = toBytes(data.data);
        return ok(bytes ? { bytes, contentType } : null);
      }
      const parts = await Promise.all(Array.from({ length: chunks }, (_, index) => ref.collection(IMAGE_CHUNKS_COLLECTION).doc(String(index)).get()));
      const pieces = parts.map((part) => toBytes(part.data()?.data));
      if (pieces.some((piece) => piece === null)) {
        logServerError("media.get", new Error(`image ${path} is missing a chunk`));
        return ok(null);
      }
      const bytes = new Uint8Array(pieces.reduce((total, piece) => total + piece!.length, 0));
      let offset = 0;
      for (const piece of pieces) {
        bytes.set(piece!, offset);
        offset += piece!.length;
      }
      return ok({ bytes, contentType });
    } catch (cause) {
      logServerError("media.get", cause);
      return err({ code: "unknown" });
    }
  }

  async remove(path: string): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(IMAGES_COLLECTION).doc(imageDocId(path));
      const snapshot = await ref.get();
      if (!snapshot.exists) return ok(undefined);
      const chunks = typeof snapshot.data()?.chunks === "number" ? (snapshot.data()!.chunks as number) : 0;
      const batch = db.batch();
      for (let index = 0; index < chunks; index += 1) batch.delete(ref.collection(IMAGE_CHUNKS_COLLECTION).doc(String(index)));
      batch.delete(ref);
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("media.remove", cause);
      return err({ code: "unknown" });
    }
  }
}
