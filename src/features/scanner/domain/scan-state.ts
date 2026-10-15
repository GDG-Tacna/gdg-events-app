import type { CheckInErrorCode, CheckpointKind, ScanReward } from "@/features/checkins";
import type { CameraErrorCode } from "./camera";

/** What came back from the server after a code was sent. */
export type ScanOutcome =
  | { ok: true; kind: CheckpointKind; recorded: boolean; firstEntrance: boolean; missions: readonly ScanReward[]; talkCredits: number; achievements: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }> }
  | { ok: false; code: CheckInErrorCode };

export type ScanState =
  | { status: "scanning" }
  | { status: "sending" }
  | { status: "done"; outcome: ScanOutcome }
  | { status: "camera-error"; code: CameraErrorCode };
