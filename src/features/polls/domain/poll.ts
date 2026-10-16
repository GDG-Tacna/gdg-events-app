import type { ImageRef } from "@/features/media/constants";
import { err, ok, type Result } from "@/shared/lib/result";

export const POLL_QUESTION_MIN = 5;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 6;
export const POLL_OPTION_MAX = 80;
export const POLL_XP_MAX = 500;
export const POLL_CREDITS_MAX = 1000;

/** What voting earns: nothing, XP, or G-Credits (paid once per cadet and poll, on the first vote). */
export const POLL_REWARD_KINDS = ["none", "xp", "credits"] as const;
export type PollRewardKind = (typeof POLL_REWARD_KINDS)[number];
export type PollReward = { kind: "none" } | { kind: "xp"; amount: number } | { kind: "credits"; amount: number };

/** A poll is prepared as a draft, opened for voting once, and closed for good. Only one is open at a time. */
export const POLL_STATUSES = ["draft", "open", "closed"] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

/** One answer. Its id is stable (`o1`..`o6`), so votes keep pointing at it; the text is also the image's description. */
export interface PollOption {
  id: string;
  text: string;
  image: ImageRef | null;
}

/** A live poll of the edition. */
export interface Poll {
  id: string;
  question: string;
  options: readonly PollOption[];
  /** Whether a cadet may change their vote while the poll is open (otherwise the first vote is final). */
  changeable: boolean;
  reward: PollReward;
  status: PollStatus;
  createdAt: Date;
  openedAt: Date | null;
  closedAt: Date | null;
}

/** What the admin's form sends: the options' images by their uploaded path. */
export interface PollDraft {
  question: string;
  options: ReadonlyArray<{ text: string; imagePath: string | null }>;
  changeable: boolean;
  reward: { kind: string; amount: number };
}

export type PollDataErrorCode = "invalid-question" | "invalid-options" | "invalid-reward";

export const optionId = (index: number) => `o${index + 1}`;
const OPTION_ID = /^o[1-6]$/;
export const isOptionId = (value: unknown): value is string => typeof value === "string" && OPTION_ID.test(value);
const POLL_ID = /^[a-z0-9][a-z0-9-]{3,47}$/;
export const isPollId = (value: unknown): value is string => typeof value === "string" && POLL_ID.test(value);

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Checks a reward: none, or a whole amount of XP (1..500) or G-Credits (1..1000). */
export function checkReward(input: { kind: string; amount: number }): Result<PollReward, PollDataErrorCode> {
  if (input.kind === "none") return ok({ kind: "none" });
  if (input.kind === "xp" && whole(input.amount, 1, POLL_XP_MAX)) return ok({ kind: "xp", amount: input.amount });
  if (input.kind === "credits" && whole(input.amount, 1, POLL_CREDITS_MAX)) return ok({ kind: "credits", amount: input.amount });
  return err("invalid-reward");
}

/**
 * Checks what the admin typed and tidies it: a question of 5..140 characters, 2..6 options of 1..80 characters,
 * all different (an option with a picture still needs its text, which describes it). The images are the caller's.
 */
export function checkPollDraft(draft: PollDraft): Result<{ question: string; options: string[]; changeable: boolean; reward: PollReward }, PollDataErrorCode> {
  const question = tidy(draft.question);
  if (question.length < POLL_QUESTION_MIN || question.length > POLL_QUESTION_MAX) return err("invalid-question");
  const options = draft.options.map((option) => tidy(option.text));
  if (options.length < POLL_OPTIONS_MIN || options.length > POLL_OPTIONS_MAX) return err("invalid-options");
  if (options.some((text) => text.length < 1 || text.length > POLL_OPTION_MAX)) return err("invalid-options");
  if (new Set(options.map((text) => text.toLowerCase())).size !== options.length) return err("invalid-options");
  const reward = checkReward(draft.reward);
  if (!reward.ok) return reward;
  return ok({ question, options, changeable: draft.changeable === true, reward: reward.value });
}

/** The XP and G-Credits a first vote pays (credits only while the edition gives them). */
export function rewardOf(poll: Pick<Poll, "reward">, creditsOn: boolean): { xp: number; credits: number } {
  if (poll.reward.kind === "xp") return { xp: poll.reward.amount, credits: 0 };
  if (poll.reward.kind === "credits" && creditsOn) return { xp: 0, credits: poll.reward.amount };
  return { xp: 0, credits: 0 };
}

/** Newest first: the open poll, then drafts, then closed ones, each by creation date. */
export function comparePolls(a: Poll, b: Poll): number {
  const rank = (poll: Poll) => ({ open: 0, draft: 1, closed: 2 })[poll.status];
  return rank(a) - rank(b) || b.createdAt.getTime() - a.createdAt.getTime();
}

/** How many voted each option, and in total. */
export interface PollTally {
  counts: Readonly<Record<string, number>>;
  total: number;
}

/** Each option's share of the votes, in whole percent (0 with no votes). */
export function percentOf(tally: PollTally, id: string): number {
  return tally.total === 0 ? 0 : Math.round(((tally.counts[id] ?? 0) * 100) / tally.total);
}
