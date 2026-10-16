import type { PollAdminErrorCode } from "../domain/manage";
import type { PollDraft, PollTally } from "../domain/poll";
import type { VoteErrorCode } from "../domain/vote";

export type PollActionResult = { ok: true } | { ok: false; code: PollAdminErrorCode };
/** Creates a draft (no id) or changes one (with its id). */
export type SavePollAction = (input: { id?: string; draft: PollDraft }) => Promise<PollActionResult>;
export type PollStateAction = (input: { id: string; action: "open" | "close" | "delete" }) => Promise<PollActionResult>;
export type PollResultsAction = (input: { id: string }) => Promise<{ ok: true; tally: PollTally } | { ok: false; code: PollAdminErrorCode }>;

export type VoteActionResult = { ok: true; xp: number; credits: number } | { ok: false; code: VoteErrorCode };
export type VoteAction = (input: { pollId: string; optionId: string }) => Promise<VoteActionResult>;

/** What the stage draws of a poll (plain data: pictures by their address). */
export interface StagePollView {
  question: string;
  status: "draft" | "open" | "closed";
  options: ReadonlyArray<{ id: string; text: string; imageUrl: string | null }>;
}
export type StagePollAction = (input: { id: string }) => Promise<{ ok: true; poll: StagePollView; tally: PollTally } | { ok: false; code: PollAdminErrorCode }>;
