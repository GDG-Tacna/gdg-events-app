// Public API (client-safe). Server-only exports live in `./server`.
export { MANAGED_ROLES, isManagedRole, normalizeEmail, type ManagedRole, type TeamMember } from "./domain/team";
export type { TeamError, TeamErrorCode } from "./domain/team-error";
export type { ChangeRoleActionResult, GrantRoleAction, RevokeRoleAction } from "./ui/actions";
export { AdminShell, type AdminNavItem, type AdminShellProps } from "./ui/AdminShell";
export { TeamView, type TeamViewProps } from "./ui/TeamView";
export { INVITE_TTL_MS, inviteState, type Invite, type InviteErrorCode, type InviteState } from "./domain/invites";
export { InviteAcceptPanel, type InviteAcceptPanelProps } from "./ui/InviteAcceptPanel";
export { InvitesPanel, type InvitesPanelProps } from "./ui/InvitesPanel";
export type { AcceptInviteAction, AcceptInviteActionResult, CreateInviteAction, CreateInviteActionResult, RevokeInviteAction, RevokeInviteActionResult } from "./ui/invite-actions";
