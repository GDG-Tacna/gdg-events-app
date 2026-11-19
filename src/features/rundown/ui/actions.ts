import type { RundownErrorCode } from "../domain/manage";
import type { ExtraPoint, StoredCue } from "../domain/rundown";

/** What saving the pieces of a point answers. */
export type SaveCuesResult = { ok: true; cues: readonly StoredCue[] } | { ok: false; code: RundownErrorCode };
export type SaveCuesAction = (input: { itemId: string; cues: readonly StoredCue[] }) => Promise<SaveCuesResult>;

/** Saves the points made in the console. */
export type SavePointsAction = (input: { points: readonly ExtraPoint[] }) => Promise<{ ok: true; points: readonly ExtraPoint[] } | { ok: false; code: RundownErrorCode }>;
/** Sets (or clears, with `null`) the minutes planned for a point. */
export type SaveMinutesAction = (input: { itemId: string; minutes: number | null }) => Promise<{ ok: true } | { ok: false; code: RundownErrorCode }>;

/** What the console asks of the stage screen; the app shell hands in the action that carries it out. */
export type StageRunnerCommand =
  | { type: "show"; display: "ranking" | "waiting" }
  | { type: "reveal" }
  | { type: "poll"; pollId: string }
  | { type: "freeze" }
  | { type: "unfreeze" }
  | { type: "view"; view: "cadets" | "squads" | "both" };
export type StageRunnerResult = { ok: true } | { ok: false; code: string };
export type StageRunner = (command: StageRunnerCommand) => Promise<StageRunnerResult>;

/** Puts a talk's attendance QR on the stage screen. */
export type ProjectTalkRunner = (input: { id: string }) => Promise<{ ok: true } | { ok: false; text: string }>;
