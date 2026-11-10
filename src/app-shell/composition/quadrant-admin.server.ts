import "server-only";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { FirestoreBadgeStore } from "@/features/achievements/server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { createCheckpoint } from "@/features/checkpoints/server";
import { FirestoreCommunicationStore } from "@/features/odyssey/server";
import { FirestoreTalkStore } from "@/features/talks/server";
import { DEFAULT_QUADRANTS, DEFAULT_VENUE, FirestoreQuadrantStore, type QuadrantAdminDeps, type StandCheckpoints } from "@/features/quadrants/server";
import { logServerError } from "@/shared/lib/log";
import { err, ok } from "@/shared/lib/result";
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
  references: {
    // Read fresh (not the cached sources): a talk or badge saved a moment ago must still stop the delete.
    to: async (quadrantId) => {
      const [talks, communications, badges] = await Promise.all([new FirestoreTalkStore().list(), new FirestoreCommunicationStore().list(), new FirestoreBadgeStore().list()]);
      if (!talks.ok || !communications.ok || !badges.ok) return err({ code: "unknown" });
      return ok([
        ...talks.value.filter((talk) => talk.roomId === quadrantId).map((talk) => talk.title),
        ...communications.value.filter((communication) => communication.quadrantId === quadrantId).map((communication) => communication.title),
        ...badges.value.filter((badge) => badge.rule.type === "quadrant-complete" && badge.rule.quadrantId === quadrantId).map((badge) => badge.name),
      ]);
    },
  },
  audit: new FirestoreAuditLog(),
  defaults: { quadrants: DEFAULT_QUADRANTS, venue: DEFAULT_VENUE },
  now: () => new Date(),
};
