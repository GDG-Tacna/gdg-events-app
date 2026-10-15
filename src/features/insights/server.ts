import "server-only";

// Public API (server-only). Client code must import from "@/features/insights" instead.
export { getInsights, type InsightsActor, type InsightsDeps, type InsightsErrorCode, type StatsSource } from "./domain/stats";
export { FirestoreStatsSource, currentEventId } from "./data/server/firestore-stats-source";
