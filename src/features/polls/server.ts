import "server-only";

// Public API (server-only). Client code must import from "@/features/polls" instead.
export { checkPollDraft, comparePolls, isPollId, rewardOf, type Poll, type PollDraft, type PollTally } from "./domain/poll";
export {
  closePoll,
  createPoll,
  deletePoll,
  listPolls,
  openPoll,
  pollResults,
  updatePoll,
  type PollAdminActor,
  type PollAdminDeps,
  type PollAdminErrorCode,
  type PollStore,
} from "./domain/manage";
export { castVote, getCadetPoll, type CadetPoll, type VoteDeps, type VoteErrorCode, type VoteStore } from "./domain/vote";
export { FirestorePollStore, toPoll } from "./data/server/firestore-poll-store";
