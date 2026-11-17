import type { Metadata } from "next";
import { createInviteAction, revokeInviteAction } from "@/app-shell/admin/invite.actions";
import { inviteDeps, teamDeps } from "@/app-shell/composition/admin.server";
import { currentEditionId } from "@/app-shell/composition/edition.server";
import { setStaffScopeAction } from "@/app-shell/admin/staff-scope.action";
import { grantRoleAction, revokeRoleAction } from "@/app-shell/admin/team.actions";
import { checkpointAdminDeps, staffScopeDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { requireRole } from "@/app-shell/guards";
import { InvitesPanel, MANAGED_ROLES, TeamView, type StationOption } from "@/features/admin";
import { listInvites, listTeam } from "@/features/admin/server";
import { STATION_KINDS, isStationKind, listCheckpoints, listStaffScopes } from "@/features/checkpoints/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { mayEdit, requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.team.title };

export default async function AdminTeamPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "team");

  const scope = session.adminScope ?? "edition";
  const actor = { uid: session.uid, role: session.role, adminScope: scope };
  const [team, invites, eventId, scopes, checkpoints, canEdit] = await Promise.all([
    listTeam(teamDeps, actor),
    listInvites(inviteDeps(), actor),
    currentEditionId(),
    listStaffScopes(staffScopeDeps, actor),
    listCheckpoints(checkpointAdminDeps, actor),
    mayEdit(session, "team"),
  ]);
  // A failed read goes to the route error boundary instead of showing an empty team that is not real.
  if (!team.ok || !invites.ok) throw new Error("Could not read the team");
  // Nor a staff member as "every station" when their limit could not be read.
  if (!scopes.ok || !checkpoints.ok) throw new Error("Could not read the staff's stations");
  // Grouped like the staff home (entrance, catering, stand), then by name.
  const stations: StationOption[] = checkpoints.value
    .flatMap(({ id, name, kind, active }) => (isStationKind(kind) ? [{ id, name, kind, active }] : []))
    .sort((a, b) => STATION_KINDS.indexOf(a.kind) - STATION_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, "es"));
  // An organizer only adds and removes staff; the server checks it again.
  const assignable = scope === "global" ? MANAGED_ROLES : (["staff"] as const);

  return (
    <ScreenEnter>
      <div className="gap-space-6 flex flex-col">
        <TeamView
          members={team.value}
          currentUid={session.uid}
          grant={grantRoleAction}
          revoke={revokeRoleAction}
          assignable={assignable}
          eventId={eventId}
          staffScopes={scopes.value}
          stations={stations}
          setScope={canEdit ? setStaffScopeAction : undefined}
        />
        <InvitesPanel invites={invites.value} assignable={assignable} create={createInviteAction} revoke={revokeInviteAction} />
      </div>
    </ScreenEnter>
  );
}
