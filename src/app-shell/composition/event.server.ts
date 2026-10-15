import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreEditionCatalog, FirestoreEditionCopier, FirestoreEventStore, FirestoreModuleStore, FirestorePermissionStore, currentEditionOf, getEditionModules, getEditionPermissions, type CopyDeps, type EditionsDeps, type EventDeps, type ModuleDeps, type PermissionDeps } from "@/features/event/server";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { copyEditionImage } from "./media.server";

/** "Is the public edition over?", for other features' rules (retiring a squad). */
export const eventDeps: EventDeps = {
  store: new FirestoreEventStore(),
  now: () => new Date(),
};

/** Composition root for the Eventos screen: every edition and which one is public. Changes go to the admin audit trail. */
export const editionsDeps: EditionsDeps = {
  catalog: new FirestoreEditionCatalog(),
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/** Composition root for copying one edition's content into another: images are copied by the media feature. */
export const copyDeps: CopyDeps = {
  catalog: editionsDeps.catalog,
  copier: new FirestoreEditionCopier(),
  copyImage: copyEditionImage,
  audit: editionsDeps.audit,
  now: () => new Date(),
};

/** Composition root for the edition's modules (which parts of the app it offers). */
export const moduleDeps: ModuleDeps = {
  store: new FirestoreModuleStore(),
  audit: editionsDeps.audit,
  now: () => new Date(),
};

/**
 * Which modules the request's edition has on, kept 30 seconds per edition (every screen asks). A save clears it on
 * this server; other servers follow within the 30 seconds.
 */
export const editionModules = ttlCached(() => getEditionModules(moduleDeps), { ttlMs: 30_000, key: currentEditionOf });

/** Composition root for what an edition lets organizers and staff do. */
export const permissionDeps: PermissionDeps = {
  store: new FirestorePermissionStore(),
  audit: editionsDeps.audit,
  now: () => new Date(),
};

/** The request's edition permissions, kept 30 seconds per edition (every control center and staff request asks). */
export const editionPermissions = ttlCached(() => getEditionPermissions(permissionDeps), { ttlMs: 30_000, key: currentEditionOf });
