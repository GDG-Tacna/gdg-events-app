import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { CheckpointStore, ManageActor } from "./manage";
import { isStationKind } from "./serve";

/**
 * The stations one staff account is limited to in an edition (`events/{eventId}/staffScopes/{uid}`). A staff member
 * without a scope operates every station of the kinds the edition gives staff; with one, only those checkpoints. It is
 * how an organizer hands an external team (a sponsor's stand) an account that reaches nothing else.
 */
export interface StaffScopeStore {
  /** The checkpoints the person is limited to, or `null` when they are not limited (no document). */
  read(uid: string): Promise<Result<readonly string[] | null, { code: string }>>;
  /** Every limited staff member of the edition with their checkpoints; someone missing here is not limited. */
  list(): Promise<Result<Readonly<Record<string, readonly string[]>>, { code: string }>>;
  /** Stores the limit, or removes it when `checkpointIds` is `null` (every station again). */
  save(uid: string, checkpointIds: readonly string[] | null, change: { by: string; at: Date }): Promise<Result<void, { code: string }>>;
}

export type StaffScopeErrorCode =
  /** No checkpoint chosen, too many, or one that is not a station of this edition. */
  | "invalid-scope"
  /** The person is not someone whose stations can be limited (an empty or impossible id). */
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface StaffScopeError {
  code: StaffScopeErrorCode;
}

export const staffScopeError = (code: StaffScopeErrorCode): StaffScopeError => ({ code });

export interface StaffScopeAuditEntry {
  action: "team.staff-scope";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

/** The admin's append-only trail (the admin feature's audit log satisfies it). */
export interface StaffScopeAudit {
  append(entry: StaffScopeAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface StaffScopeDeps {
  scopes: StaffScopeStore;
  /** The edition's checkpoints, to accept only real stations. */
  checkpoints: Pick<CheckpointStore, "list">;
  audit: StaffScopeAudit;
  now: () => Date;
}

/** More stations than any edition has: a longer list is not a real choice. */
export const STAFF_SCOPE_MAX = 50;

const isUid = (uid: string) => uid.length > 0 && uid.length <= 128 && !uid.includes("/");

/** Every limited staff member of the request's edition, for Admin › Equipo. */
export async function listStaffScopes(
  deps: Pick<StaffScopeDeps, "scopes">,
  actor: ManageActor,
): Promise<Result<Readonly<Record<string, readonly string[]>>, StaffScopeError>> {
  if (actor.role !== "admin") return err(staffScopeError("forbidden"));
  const listed = await deps.scopes.list();
  return listed.ok ? ok(listed.value) : err(staffScopeError("unknown"));
}

/**
 * Limits a staff account to some stations of the edition, or lifts the limit (`checkpointIds: null`). Only entrance,
 * catering and stand checkpoints of this edition are accepted (open or closed: a closed stand may reopen), each once,
 * and at least one: an account limited to nothing would be better removed from the team. The caller checks that the
 * admin may edit the team (an organizer manages staff, as with roles). The change is audited; it applies on the
 * person's next request.
 */
export async function setStaffScope(
  deps: StaffScopeDeps,
  actor: ManageActor,
  input: { uid: string; checkpointIds: readonly string[] | null },
): Promise<Result<readonly string[] | null, StaffScopeError>> {
  if (actor.role !== "admin") return err(staffScopeError("forbidden"));
  if (!isUid(input.uid)) return err(staffScopeError("not-found"));

  let chosen: readonly string[] | null = null;
  if (input.checkpointIds !== null) {
    const unique = [...new Set(input.checkpointIds)];
    if (unique.length === 0 || unique.length > STAFF_SCOPE_MAX) return err(staffScopeError("invalid-scope"));

    const listed = await deps.checkpoints.list();
    if (!listed.ok) return err(staffScopeError("unknown"));
    const stations = new Set(listed.value.filter((checkpoint) => isStationKind(checkpoint.kind)).map((checkpoint) => checkpoint.id));
    if (!unique.every((id) => stations.has(id))) return err(staffScopeError("invalid-scope"));
    chosen = unique;
  }

  const at = deps.now();
  const saved = await deps.scopes.save(input.uid, chosen, { by: actor.uid, at });
  if (!saved.ok) return err(staffScopeError("unknown"));

  const written = await deps.audit.append({
    action: "team.staff-scope",
    actorUid: actor.uid,
    targetUid: input.uid,
    details: { checkpoints: chosen === null ? null : chosen.join(",") },
    at,
  });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("checkpoints.staff-scope.audit", new Error(`audit entry missing for ${input.uid}`));
  return ok(chosen);
}
