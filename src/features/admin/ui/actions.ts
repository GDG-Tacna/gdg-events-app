import type { ManagedRole, TeamMember } from "../domain/team";
import type { TeamErrorCode } from "../domain/team-error";

/** What the team server actions answer to the screens. Plain data: it crosses the client boundary. */
export type ChangeRoleActionResult =
  | { ok: true; /** The member after a grant, or null after a revoke. */ member: TeamMember | null }
  | { ok: false; code: TeamErrorCode };

export type GrantRoleAction = (input: { email: string; role: ManagedRole }) => Promise<ChangeRoleActionResult>;
export type RevokeRoleAction = (input: { email: string }) => Promise<ChangeRoleActionResult>;

/** A station a staff account can be limited to, as the Equipo screen lists it. */
export interface StationOption {
  id: string;
  name: string;
  kind: "entrance" | "catering" | "stand";
  /** A closed station can still be chosen: it may reopen. */
  active: boolean;
}

/** Why limiting a staff account's stations failed (the checkpoints feature's codes, as plain data). */
export type StaffScopeErrorCode = "invalid-scope" | "not-found" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

/** The stations the account is limited to after the change, or `null` for every station. */
export type SetStaffScopeActionResult = { ok: true; checkpointIds: readonly string[] | null } | { ok: false; code: StaffScopeErrorCode };
export type SetStaffScopeAction = (input: { uid: string; checkpointIds: readonly string[] | null }) => Promise<SetStaffScopeActionResult>;
