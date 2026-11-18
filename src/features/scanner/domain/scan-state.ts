import type { CheckInErrorCode, ScanContact, ScanKind, ScanProgress, ScanReward } from "@/features/checkins";
import type { CameraErrorCode } from "./camera";

/** The scanned puesto as the cadet sees it: its name, description and image address. */
export interface ScannedPlace {
  name: string;
  description: string;
  image: string | null;
}

/** What came back from the server after a code was sent. */
export type ScanOutcome =
  | {
      ok: true;
      kind: ScanKind;
      recorded: boolean;
      firstEntrance: boolean;
      missions: readonly ScanReward[];
      talkCredits: number;
      achievements: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
      /** Absent or null for a speaker's code. */
      checkpoint?: ScannedPlace | null;
      /** The other cadet, for a contact code. */
      contact?: ScanContact | null;
      /** How the XP bar moved, when the scan gave XP. */
      progress?: ScanProgress | null;
    }
  | { ok: false; code: CheckInErrorCode };

export type ScanState =
  | { status: "scanning" }
  | { status: "sending" }
  | { status: "done"; outcome: ScanOutcome }
  | { status: "camera-error"; code: CameraErrorCode };
