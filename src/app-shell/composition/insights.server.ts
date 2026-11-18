import "server-only";
import { squadStore } from "@/app-shell/composition/squads.server";
import { CachedStatsSource, FirestoreStatsSource, currentEventId, type InsightsDeps } from "@/features/insights/server";
import { err, ok } from "@/shared/lib/result";

/** Composition root for the admin's home: counts over the edition the app serves and the earlier ones. */
export const insightsDeps: InsightsDeps = {
  // The counts are for looking at: kept half a minute, so refreshing the home does not pay for them again.
  stats: new CachedStatsSource(new FirestoreStatsSource()),
  currentEventId,
  squads: {
    list: async () => {
      const listed = await squadStore.list();
      return listed.ok ? ok(listed.value.map(({ id, name }) => ({ id, name }))) : err({ code: "unknown" });
    },
  },
};
