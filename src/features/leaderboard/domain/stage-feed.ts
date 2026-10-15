import type { RankingEntry } from "./ranking";
import type { StageState } from "./stage";

/** How the stage screen's live connection is doing, so the projector can say it plainly. */
export type FeedStatus = "connecting" | "live" | "reconnecting" | "signed-out" | "denied";

export interface StageFeedHandlers {
  stage(state: StageState): void;
  /** Every participant of the edition (XP 0 included, for squad sizes), each time one changes. */
  participants(entries: readonly RankingEntry[]): void;
  status(status: FeedStatus): void;
}

/** The stage screen's realtime source: the stage document and the edition's participants. */
export interface StageFeed {
  /** Starts listening; the returned function stops every listener. */
  subscribe(eventId: string, handlers: StageFeedHandlers): () => void;
}
