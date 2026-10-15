import "server-only";
import { eventDeps } from "@/app-shell/composition/event.server";
import { squadStore } from "@/app-shell/composition/squads.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { hasEventFinished } from "@/features/event/server";
import type { SquadAdminDeps } from "@/features/squads/server";
import { recordImages } from "./media.server";

/**
 * Composition root for managing squads. "Is the event over?" comes from the event feature, and changes
 * go to the admin audit trail; both are bound here so the squads feature imports neither.
 */
export const squadAdminDeps: SquadAdminDeps = {
  store: squadStore,
  clock: { hasFinished: () => hasEventFinished(eventDeps) },
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
