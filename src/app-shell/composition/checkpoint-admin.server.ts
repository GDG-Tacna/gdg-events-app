import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreCheckpointStore, FirestoreStaffScopeStore, type ManageDeps, type PlanStands, type StaffScopeDeps } from "@/features/checkpoints/server";
import { DEFAULT_VENUE, FirestoreQuadrantStore, standCheckpointId } from "@/features/quadrants/server";
import { ok } from "@/shared/lib/result";
import { recordImages } from "./media.server";

/**
 * The stands of the edition's venue plan (the bundled plan while the edition has none of its own: saving it would
 * create them). Read fresh: a plan saved a moment ago must already lock its stands.
 */
const planStands: PlanStands = {
  async ids() {
    const venue = await new FirestoreQuadrantStore().loadVenue();
    if (!venue.ok) return venue;
    const plan = venue.value ?? DEFAULT_VENUE;
    return ok(plan.areas.filter((area) => area.kind === "stand").map((area) => standCheckpointId(area.id)));
  },
};

/**
 * Composition root for managing checkpoints. Changes go to the same append-only audit trail as the team
 * changes (the admin feature's log, which satisfies what this feature asks for).
 */
export const checkpointAdminDeps: ManageDeps = {
  store: new FirestoreCheckpointStore(),
  audit: new FirestoreAuditLog(),
  images: recordImages,
  planStands,
  now: () => new Date(),
};

/** Where each staff account's stations live (Admin › Equipo writes them; every staff request reads its own). */
export const staffScopeStore = new FirestoreStaffScopeStore();

/** Composition root for limiting staff to some stations: the same checkpoints and audit trail as above. */
export const staffScopeDeps: StaffScopeDeps = {
  scopes: staffScopeStore,
  checkpoints: checkpointAdminDeps.store,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
