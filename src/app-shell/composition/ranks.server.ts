import "server-only";
import { RANKS } from "@/features/attendee";
import { CachedRankStore, FirestoreRankStore, type RankAdminDeps } from "@/features/attendee/server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreCheckpointStore } from "@/features/checkpoints/server";
import { rankName } from "@/shared/copy/rank-name";
import { err, ok } from "@/shared/lib/result";
import { recordImages } from "./media.server";
import { perEdition } from "./per-edition";

/** The bundled ladder with the names it has in the copy, so it can be shown and edited like a saved one. */
const defaults = RANKS.map((rank) => ({ ...rank, name: rankName(rank.id, rank.level) }));

/** The edition's ladder, kept for a minute; saving through it drops the cache at once. */
export const rankStore = perEdition(() => new CachedRankStore(new FirestoreRankStore()));

/** Composition root for the rank ladder: read by the dashboard, edited from the admin. */
export const rankDeps: RankAdminDeps = {
  store: rankStore,
  defaults,
  gates: {
    // Read fresh: a gate saved a moment ago must still keep its level.
    highestLevelRequired: async () => {
      const listed = await new FirestoreCheckpointStore().list();
      if (!listed.ok) return err({ code: "unknown" });
      return ok(Math.max(0, ...listed.value.map((checkpoint) => checkpoint.requirements.minLevel ?? 0)));
    },
  },
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
