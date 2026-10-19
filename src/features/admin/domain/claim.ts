import { ok, type Result } from "@/shared/lib/result";
import type { TeamRepository } from "./ports";
import type { ManagedRole } from "./team";
import type { TeamError } from "./team-error";

const STRENGTH: Record<ManagedRole, number> = { staff: 1, organizer: 2, admin: 3 };

/**
 * The role claim a person must hold after their role in the active edition became `role` (already filed in the team).
 * The claim is one global value while staff and organizers belong to editions, so it is their strongest role in any
 * edition: what they may do in each one is still decided by that edition's team when the session is resolved. Writing
 * the role of the edition being edited instead would demote or strip their place in every other edition.
 */
export async function claimAfterChange(team: TeamRepository, uid: string, role: ManagedRole | null): Promise<Result<ManagedRole | null, TeamError>> {
  if (role === "admin") return ok("admin");
  const records = await team.editionRolesOf(uid);
  if (!records.ok) return records;
  let strongest = role;
  for (const { role: held } of records.value) {
    if (strongest === null || STRENGTH[held] > STRENGTH[strongest]) strongest = held;
  }
  return ok(strongest);
}
