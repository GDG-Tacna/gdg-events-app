import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isOptionId, isPollId, rewardOf, type Poll } from "./poll";

export type VoteErrorCode =
  | "not-found"
  /** The poll is not open (not yet, or closed). */
  | "closed"
  | "invalid-option"
  /** The poll keeps the first vote and this cadet already voted. */
  | "already-voted"
  | "not-registered"
  | "rate-limited"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface VoteStore {
  /** The edition's open poll, if any. */
  openPoll(): Promise<Result<Poll | null, { code: string }>>;
  /** The option this cadet voted in that poll, or `null`. */
  myVote(pollId: string, uid: string): Promise<Result<string | null, { code: string }>>;
  /**
   * Records a vote in one transaction that reads the poll: it must be open, and a poll that keeps the first vote
   * refuses a second. Answers the poll as the transaction read it and whether this was the cadet's first vote.
   */
  cast(pollId: string, uid: string, optionId: string, at: Date): Promise<Result<{ first: boolean; poll: Poll } | "closed" | "invalid-option" | "already-voted" | null, { code: string }>>;
}

export interface VoteDeps {
  votes: VoteStore;
  /** Pays the poll's reward through the XP ledger: one source per poll, so a repeat pays nothing. */
  ledger: { grant(grant: { uid: string; source: `poll:${string}`; xp: number; credits: number }): Promise<Result<{ granted: boolean }, { code: string }>> };
  /** Whether the edition gives G-Credits now (a credits prize pays nothing while they are off). */
  creditsOn: () => Promise<boolean>;
  limiter: { consume(uid: string): Promise<boolean> };
  now: () => Date;
}

/** What a cadet sees: the open poll (without its tally) and their own vote. */
export interface CadetPoll {
  poll: Poll;
  myVote: string | null;
  /** What the first vote pays now (nothing when the poll has no prize or its currency is off). */
  reward: { xp: number; credits: number };
}

/** The open poll for a cadet, with their vote. `null` when no poll is open. */
export async function getCadetPoll(deps: Pick<VoteDeps, "votes" | "creditsOn">, uid: string): Promise<Result<CadetPoll | null, { code: VoteErrorCode }>> {
  const open = await deps.votes.openPoll();
  if (!open.ok) return err({ code: "unknown" });
  if (!open.value) return ok(null);
  const mine = await deps.votes.myVote(open.value.id, uid);
  if (!mine.ok) return err({ code: "unknown" });
  return ok({ poll: open.value, myVote: mine.value, reward: rewardOf(open.value, await deps.creditsOn()) });
}

/**
 * A cadet's vote. The poll and its open state are checked inside the vote's transaction, so a vote never lands after
 * the poll closed. The first vote pays the prize through the ledger (once per poll); a failed payment is retried by
 * voting again on a poll that lets the vote change, and is logged otherwise. Answers what this vote earned.
 */
export async function castVote(deps: VoteDeps, uid: string, input: { pollId: string; optionId: string }): Promise<Result<{ xp: number; credits: number }, { code: VoteErrorCode }>> {
  if (!isPollId(input.pollId)) return err({ code: "not-found" });
  if (!isOptionId(input.optionId)) return err({ code: "invalid-option" });
  if (!(await deps.limiter.consume(uid))) return err({ code: "rate-limited" });

  const cast = await deps.votes.cast(input.pollId, uid, input.optionId, deps.now());
  if (!cast.ok) return err({ code: "unknown" });
  if (cast.value === null) return err({ code: "not-found" });
  if (typeof cast.value === "string") return err({ code: cast.value });

  const reward = rewardOf(cast.value.poll, await deps.creditsOn());
  if (reward.xp + reward.credits === 0) return ok({ xp: 0, credits: 0 });

  const granted = await deps.ledger.grant({ uid, source: `poll:${input.pollId}`, ...reward });
  if (!granted.ok) {
    if (granted.error.code === "not-registered") return err({ code: "not-registered" });
    logServerError("polls.reward", new Error(`${granted.error.code} for ${input.pollId}`));
    return ok({ xp: 0, credits: 0 });
  }
  return ok(granted.value.granted ? reward : { xp: 0, credits: 0 });
}
