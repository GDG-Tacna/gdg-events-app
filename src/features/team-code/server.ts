import "server-only";

// Public API (server-only). Client code must import from "@/features/team-code" instead.
export {
  issueTeamCode,
  teamRoleOf,
  verifyTeamCode,
  type IssuedTeamCode,
  type TeamCodeActor,
  type TeamCodeDeps,
  type TeamCodeErrorCode,
  type TeamCodeEncoder,
  type TeamCodeSigner,
  type VerifyTeamCodeOutcome,
} from "./domain/team-code";
