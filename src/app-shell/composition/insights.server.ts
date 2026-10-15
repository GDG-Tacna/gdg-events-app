import "server-only";
import { FirestoreStatsSource, currentEventId, type InsightsDeps } from "@/features/insights/server";

/** Composition root for the admin's home: counts over the edition the app serves and the earlier ones. */
export const insightsDeps: InsightsDeps = {
  stats: new FirestoreStatsSource(),
  currentEventId,
};
