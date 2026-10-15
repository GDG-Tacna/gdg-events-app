import type { CodeLanguage, Difficulty, MinigameId } from "../domain/catalog";
import type { MinigameErrorCode } from "../domain/plays";

/** What starting a play answers. Plain data: it crosses the client boundary (`expiresAt` in milliseconds). */
export type StartMinigameActionResult =
  | { ok: true; gameId: MinigameId; difficulty: Difficulty; expiresAt: number; codeLanguages: readonly CodeLanguage[] }
  | { ok: false; code: MinigameErrorCode };

/** What sending the result answers: the XP a win paid, and the badges it unlocked. */
export type FinishMinigameActionResult =
  | { ok: true; status: "won" | "lost"; xpBonus: number; achievements: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }> }
  | { ok: false; code: MinigameErrorCode };

export type StartMinigameAction = (input: { missionId: string }) => Promise<StartMinigameActionResult>;
export type FinishMinigameAction = (input: { missionId: string; won: boolean }) => Promise<FinishMinigameActionResult>;
