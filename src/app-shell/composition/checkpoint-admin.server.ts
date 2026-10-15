import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreCheckpointStore, type ManageDeps } from "@/features/checkpoints/server";

/**
 * Composition root for managing checkpoints. Changes go to the same append-only audit trail as the team
 * changes (the admin feature's log, which satisfies what this feature asks for).
 */
export const checkpointAdminDeps: ManageDeps = {
  store: new FirestoreCheckpointStore(),
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
