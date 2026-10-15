import type { CompletionStatus } from "../domain/completion";
import type { MissionErrorCode } from "../domain/use-cases";

/** What the attendee types or picks. Scans never go through here: they come from the scanner. */
export type MissionAnswer = { kind: "choice"; option: number } | { kind: "keyword"; value: string };

/** What the answer action returns to the mission screen. Plain data: it crosses the client boundary. */
export type SubmitMissionActionResult =
  | {
      ok: true;
      status: CompletionStatus;
      xpEarned: number;
      creditsEarned: number;
      attemptsLeft: number | null;
      /** True when the mission was already closed: the answer changed nothing. */
      closed: boolean;
      /** Badges this answer unlocked (absent or empty when none). */
      achievements?: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
    }
  | { ok: false; code: MissionErrorCode };

export type SubmitMissionAction = (input: { missionId: string; answer: MissionAnswer }) => Promise<SubmitMissionActionResult>;
