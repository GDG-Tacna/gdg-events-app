import type { ManagedRole, TeamMember } from "../domain/team";
import type { TeamErrorCode } from "../domain/team-error";

/** What the team server actions answer to the screens. Plain data: it crosses the client boundary. */
export type ChangeRoleActionResult =
  | { ok: true; /** The member after a grant, or null after a revoke. */ member: TeamMember | null }
  | { ok: false; code: TeamErrorCode };

export type GrantRoleAction = (input: { email: string; role: ManagedRole }) => Promise<ChangeRoleActionResult>;
export type RevokeRoleAction = (input: { email: string }) => Promise<ChangeRoleActionResult>;
