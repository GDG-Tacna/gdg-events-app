import type { Metadata } from "next";
import { createInviteAction, revokeInviteAction } from "@/app-shell/admin/invite.actions";
import { inviteDeps, teamDeps } from "@/app-shell/composition/admin.server";
import { currentEditionId } from "@/app-shell/composition/edition.server";
import { grantRoleAction, revokeRoleAction } from "@/app-shell/admin/team.actions";
import { requireRole } from "@/app-shell/guards";
import { InvitesPanel, MANAGED_ROLES, TeamView } from "@/features/admin";
import { listInvites, listTeam } from "@/features/admin/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.team.title };

export default async function AdminTeamPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "team");

  const scope = session.adminScope ?? "edition";
  const actor = { uid: session.uid, role: session.role, adminScope: scope };
  const [team, invites, eventId] = await Promise.all([listTeam(teamDeps, actor), listInvites(inviteDeps(), actor), currentEditionId()]);
  // A failed read goes to the route error boundary instead of showing an empty team that is not real.
  if (!team.ok || !invites.ok) throw new Error("Could not read the team");
  // An organizer only adds and removes staff; the server checks it again.
  const assignable = scope === "global" ? MANAGED_ROLES : (["staff"] as const);

  return (
    <ScreenEnter>
      <div className="gap-space-6 flex flex-col">
        <TeamView members={team.value} currentUid={session.uid} grant={grantRoleAction} revoke={revokeRoleAction} assignable={assignable} eventId={eventId} />
        <InvitesPanel invites={invites.value} assignable={assignable} create={createInviteAction} revoke={revokeInviteAction} />
      </div>
    </ScreenEnter>
  );
}
