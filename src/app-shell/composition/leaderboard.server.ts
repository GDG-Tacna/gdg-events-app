import "server-only";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { CachedRankingSource, FirestoreRankingSource, FirestoreStageStore, type LeaderboardDeps, type StageDeps } from "@/features/leaderboard/server";
import { err, ok } from "@/shared/lib/result";
import { perEdition } from "./per-edition";
import { recordImages } from "./media.server";

/**
 * Composition root for the fleet ranking: participants read through a source whose shared parts (the top, the
 * number of cadets, the squad totals) are kept a few seconds, and the squads from the cached catalog.
 */
export const leaderboardDeps: LeaderboardDeps = {
  ranking: perEdition(() => new CachedRankingSource(new FirestoreRankingSource())),
  squads: {
    list: async () => {
      const listed = await squadCatalog.list();
      return listed.ok ? ok(listed.value.map(({ id, name, active }) => ({ id, name, active }))) : err({ code: "unknown" });
    },
  },
};

/**
 * Composition root for the stage: freezing and revealing read the ranking as it stands this very moment (never
 * the few-seconds cache), and every change goes to the admin audit trail.
 */
export const stageDeps: StageDeps = {
  ranking: new FirestoreRankingSource(),
  squads: leaderboardDeps.squads,
  stage: new FirestoreStageStore(),
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
