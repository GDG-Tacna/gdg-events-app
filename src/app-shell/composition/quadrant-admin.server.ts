import "server-only";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { createCheckpoint } from "@/features/checkpoints/server";
import { DEFAULT_QUADRANTS, DEFAULT_VENUE, FirestoreQuadrantStore, type QuadrantAdminDeps, type StandCheckpoints } from "@/features/quadrants/server";
import { logServerError } from "@/shared/lib/log";
import { recordImages } from "./media.server";

/**
 * Each stand of the plan gets its printed-QR checkpoint through the checkpoints feature (with its rules and
 * audit line). One that already exists is kept as it is: its name, state and history belong to Puestos.
 */
const stands: StandCheckpoints = {
  async ensure(actor, list) {
    const created: string[] = [];
    const failed: string[] = [];
    for (const stand of list) {
      const result = await createCheckpoint(checkpointAdminDeps, actor, { id: stand.id, name: stand.name, kind: "stand" });
      if (result.ok) created.push(stand.id);
      else if (result.error.code !== "already-exists") {
        failed.push(stand.id);
        logServerError("quadrants.stands.ensure", new Error(`${result.error.code} for ${stand.id}`));
      }
    }
    return { created, failed };
  },
};

/** Composition root for managing quadrants and the venue plan. */
export const quadrantAdminDeps: QuadrantAdminDeps = {
  store: new FirestoreQuadrantStore(),
  stands,
  images: recordImages,
  audit: new FirestoreAuditLog(),
  defaults: { quadrants: DEFAULT_QUADRANTS, venue: DEFAULT_VENUE },
  now: () => new Date(),
};
