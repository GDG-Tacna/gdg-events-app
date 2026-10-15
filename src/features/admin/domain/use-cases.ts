import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AuditLog, RoleDirectory, TeamRepository } from "./ports";
import { normalizeEmail, type ManagedRole, type TeamMember } from "./team";
import { teamError, type TeamError } from "./team-error";

export interface TeamDeps {
  directory: RoleDirectory;
  team: TeamRepository;
  audit: AuditLog;
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface Actor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
  /** "edition" for an organizer: it may only add and remove staff. Missing means a global admin. */
  adminScope?: "global" | "edition";
}

const requireAdmin = (actor: Actor): TeamError | null => (actor.role === "admin" ? null : teamError("forbidden"));
const isOrganizer = (actor: Actor) => actor.adminScope === "edition";
/** What an organizer may touch: only staff (a new one, or someone who is staff now). */
const organizerMayChange = (from: ManagedRole | null, to: ManagedRole | null) => (to === null || to === "staff") && (from === null || from === "staff");

export async function listTeam(deps: TeamDeps, actor: Actor): Promise<Result<readonly TeamMember[], TeamError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);
  return deps.team.list();
}

/**
 * Applies a role change to the account with that email. The order protects the invariants: the team
 * record is changed first, in a transaction that refuses to remove the last admin; then the role claim
 * (what actually grants access) is set, and if that fails the team record is put back. The audit entry
 * is written last; a failure there is logged loudly but does not undo a change that already happened.
 */
async function changeRole(
  deps: TeamDeps,
  actor: Actor,
  input: { email: string },
  role: ManagedRole | null,
): Promise<Result<TeamMember | null, TeamError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const email = normalizeEmail(input.email);
  if (email === null) return err(teamError("invalid-email"));

  const found = await deps.directory.findByEmail(email);
  if (!found.ok) return found;
  if (found.value === null) return err(teamError("user-not-found"));
  const account = found.value;
  if (account.uid === actor.uid) return err(teamError("cannot-change-self"));

  if (isOrganizer(actor)) {
    const current = await deps.team.roleOf(account.uid);
    if (!current.ok) return current;
    if (!organizerMayChange(current.value, role)) return err(teamError("forbidden"));
  }

  const changed = await deps.team.change(account, role);
  if (!changed.ok) return changed;

  const member: TeamMember | null =
    role === null ? null : { uid: account.uid, email: account.email, displayName: account.displayName, role };
  // Nothing to change (for example revoking a plain attendee): leave their claim and the audit trail alone.
  if (changed.value.previous === role) return ok(member);

  const claim = await deps.directory.setRole(account.uid, role);
  if (!claim.ok) {
    // Put the team record back so the list does not claim a role the account does not have.
    const restored = await deps.team.change(account, changed.value.previous);
    if (!restored.ok) logServerError("admin.team.restore", new Error(`team record out of sync for ${account.uid}`));
    return claim;
  }

  const audited = await deps.audit.append({
    action: role === null ? "role.revoked" : "role.granted",
    actorUid: actor.uid,
    targetUid: account.uid,
    details: { role, previous: changed.value.previous },
    at: deps.now(),
  });
  if (!audited.ok) logServerError("admin.audit.append", new Error(`audit entry missing for ${account.uid}`));

  return ok(member);
}

export function grantRole(
  deps: TeamDeps,
  actor: Actor,
  input: { email: string; role: ManagedRole },
): Promise<Result<TeamMember | null, TeamError>> {
  return changeRole(deps, actor, input, input.role);
}

export function revokeRole(
  deps: TeamDeps,
  actor: Actor,
  input: { email: string },
): Promise<Result<TeamMember | null, TeamError>> {
  return changeRole(deps, actor, input, null);
}
