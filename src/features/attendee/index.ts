// Public API (client-safe). Server-only exports live in `./server`.
export type { Attendee } from "./domain/attendee";
export type { AttendeeError, AttendeeErrorCode } from "./domain/attendee-error";
export {
  ALIAS_MAX_LENGTH,
  ALIAS_MIN_LENGTH,
  createAlias,
  type Alias,
  type AliasErrorCode,
} from "./domain/alias";
export {
  RANKS,
  RANKS_MAX,
  RANK_NAME_MAX,
  RANK_XP_MAX,
  createRankLadder,
  parseRankLadder,
  rankLadderProblems,
  type RankProblem,
  nextRank,
  rankFor,
  rankProgress,
  type Rank,
  type RankDefinition,
  type RankId,
  type RankLadder,
  type RankProgress,
} from "./domain/rank";
export type {
  RegisterAttendeeAction,
  RegisterAttendeeActionResult,
  RegisterAttendeeInput,
} from "./ui/registration";
export { OnboardingForm } from "./ui/OnboardingForm";
export {
  useAttendeeRegistration,
  type RegistrationState,
  type RegistrationStatus,
} from "./ui/use-attendee-registration";
export type { RankAdminErrorCode } from "./domain/rank-admin";
export type { SaveRanksAction, SaveRanksActionResult } from "./ui/ranks-action";
export { RanksEditor, type RanksEditorProps } from "./ui/RanksEditor";
