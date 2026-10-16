// Public API (client-safe). Server-only exports live in `./server`.
export {
  POLL_CREDITS_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POLL_XP_MAX,
  percentOf,
  type Poll,
  type PollDraft,
  type PollOption,
  type PollReward,
  type PollStatus,
  type PollTally,
} from "./domain/poll";
export type { PollAdminErrorCode } from "./domain/manage";
export type { CadetPoll, VoteErrorCode } from "./domain/vote";
export type { PollActionResult, PollResultsAction, PollStateAction, SavePollAction, VoteAction, VoteActionResult } from "./ui/actions";
export { PollsAdminView, rewardLabel, type PollsAdminViewProps } from "./ui/PollsAdminView";
export { PollForm, type PollFormProps } from "./ui/PollForm";
export { PollResultsView, votesLabel, type PollResultsViewProps } from "./ui/PollResultsView";
export { LivePollCard, PollVoteView, rewardLine, type PollVoteViewProps } from "./ui/PollVoteView";
export { LivePollStage, PollStageView } from "./ui/PollStageView";
export type { StagePollAction, StagePollView } from "./ui/actions";
