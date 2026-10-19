import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { CachedImageStore, FirestoreImageStore, copyImage, currentImageEventId, imageProcessor, imageRefOf, removeImage, type MediaDeps, type RecordImages } from "@/features/media/server";

/** Images in Firestore, the ones served most kept in memory (each read of /media would otherwise read Firestore). */
const imageStore = new CachedImageStore(new FirestoreImageStore());

/** Composition root for uploaded images (admin screens). */
export const mediaDeps: MediaDeps = {
  processor: imageProcessor,
  store: imageStore,
  eventId: currentImageEventId,
  newId: () => crypto.randomUUID(),
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/** What record use cases (badges, prizes, squads…) use to point at an uploaded image and drop a replaced one. */
export const recordImages: RecordImages = {
  ref: imageRefOf,
  remove: (path) => removeImage({ store: imageStore, eventId: currentImageEventId }, path),
};

/** What the /media route reads: the same cached store. */
export const imageReader = { store: imageStore };

/** Copies an image into another edition's folder (copying an edition's content). */
export const copyEditionImage = (path: string, toEventId: string) => copyImage({ store: imageStore, newId: () => crypto.randomUUID() }, path, toEventId);
