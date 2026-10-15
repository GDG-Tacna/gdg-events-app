// Public API (client-safe). Server-only exports live in `./server`.
export type { EditionStats, InsightsOverview, PastEdition } from "./domain/stats";
export { InsightsPanel, share, type InsightsPanelProps } from "./ui/InsightsPanel";
