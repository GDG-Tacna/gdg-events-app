import type { CheckInErrorCode } from "../domain/checkin-error";
import type { CheckpointId, CheckpointKind } from "../domain/checkpoint";

/** A mission the scan completed, filled in by the app shell (check-ins know nothing about missions). */
export interface ScanReward {
  title: string;
  xpEarned: number;
  creditsEarned: number;
  /** False when the mission was already completed: nothing new was earned. */
  justCompleted: boolean;
}

/** What the server action answers to the scanner screen. Plain data: it crosses the client boundary. */
export type RecordCheckInActionResult =
  | {
      ok: true;
      checkpointId: CheckpointId;
      kind: CheckpointKind;
      recorded: boolean;
      firstEntrance: boolean;
      /** Missions tied to this checkpoint (talks and stands). Absent or empty when there are none. */
      missions?: readonly ScanReward[];
      /** G-Credits this scan earned for attending a talk (0 or absent when none). */
      talkCredits?: number;
      /** Badges this scan unlocked (absent or empty when none). */
      achievements?: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
    }
  | { ok: false; code: CheckInErrorCode };

export type RecordCheckInAction = (payload: string) => Promise<RecordCheckInActionResult>;
