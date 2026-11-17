import type { CheckInErrorCode } from "../domain/checkin-error";
import type { CheckpointId, CheckpointKind } from "../domain/checkpoint";

/** A mission the scan completed, filled in by the app shell (check-ins know nothing about missions). */
export interface ScanReward {
  /** The mission's id, so the screen can take the cadet to it on the board. */
  id: string;
  title: string;
  xpEarned: number;
  creditsEarned: number;
  /** False when the mission was already completed: nothing new was earned. */
  justCompleted: boolean;
}

/** What the server action answers to the scanner screen. Plain data: it crosses the client boundary. */
/** What a scan was: a checkpoint of some kind, a speaker's own code («Conoce al speaker») or another cadet's contact code. */
export type ScanKind = CheckpointKind | "speaker" | "contact";

/** The other cadet a contact code was scanned from: their card and what the contact paid. Filled in by the app shell. */
export interface ScanContact {
  card: { alias: string; squad: string | null; links: { linkedin: string | null; github: string | null; web: string | null } };
  /** False when the two were already contacts. */
  created: boolean;
  xpEarned: number;
  creditsEarned: number;
  /** Past the edition's cap of paid contacts: the contact counts, it pays nothing. */
  capReached: boolean;
}

export type RecordCheckInActionResult =
  | {
      ok: true;
      /** The checkpoint, or the speaker for a speaker's code. */
      checkpointId: CheckpointId;
      kind: ScanKind;
      recorded: boolean;
      firstEntrance: boolean;
      /** The other cadet, for a contact code (absent otherwise). `recorded` then means the contact is new. */
      contact?: ScanContact;
      /** The scanned puesto as the cadet sees it (absent for a speaker's or a contact code). */
      checkpoint?: { name: string; description: string; image: string | null };
      /** Missions tied to this checkpoint (talks and stands) or speaker. Absent or empty when there are none. */
      missions?: readonly ScanReward[];
      /** G-Credits this scan earned for attending a talk (0 or absent when none). */
      talkCredits?: number;
      /** Badges this scan unlocked (absent or empty when none). */
      achievements?: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
    }
  | { ok: false; code: CheckInErrorCode };

export type RecordCheckInAction = (payload: string) => Promise<RecordCheckInActionResult>;
