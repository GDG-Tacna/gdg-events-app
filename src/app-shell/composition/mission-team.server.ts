import "server-only";
import type { TeamMember } from "@/features/admin/server";
import type { TeamRole } from "@/features/missions/server";
import { err, ok, type Result } from "@/shared/lib/result";
import { teamDeps } from "./admin.server";

/**
 * The role a team member's code carries, so the missions that ask a cadet to meet an organizer or a volunteer can name
 * the people who count: staff are volunteers; organizers and admins are organizers (the same rule as the team code).
 */
export const missionRoleOf = (role: TeamMember["role"]): TeamRole => (role === "staff" ? "volunteer" : "organizer");

/** The edition's team grouped by the role its code carries. Read fresh: someone added a moment ago must be choosable. */
export async function teamByMissionRole(): Promise<Result<Record<TeamRole, readonly TeamMember[]>, { code: string }>> {
  const listed = await teamDeps.team.list();
  if (!listed.ok) return err({ code: "unknown" });
  const grouped: Record<TeamRole, TeamMember[]> = { organizer: [], volunteer: [] };
  for (const member of listed.value) grouped[missionRoleOf(member.role)].push(member);
  return ok(grouped);
}
