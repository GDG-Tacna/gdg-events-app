import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { grantRoleAction, revokeRoleAction } from "@/app-shell/admin/team.actions";
import { linkSpeakerAccountAction, unlinkSpeakerAction } from "@/app-shell/speakers/access.actions";
import { speakerAccessDeps } from "@/app-shell/composition/speakers.server";
import { teamDeps } from "@/app-shell/composition/admin.server";
import { banCadetAction, changeCadetSquadAction, deleteCadetAction, renameCadetAction, unbanCadetAction } from "@/app-shell/cadets/manage.actions";
import { cadetsDeps } from "@/app-shell/composition/cadets.server";
import { squadStore } from "@/app-shell/composition/squads.server";
import { changeCadetTicketAction } from "@/app-shell/tickets/tickets.actions";
import { requireRole } from "@/app-shell/guards";
import { mayEdit, requireSection } from "@/app-shell/permissions.server";
import { MANAGED_ROLES } from "@/features/admin";
import { CadetDetailView } from "@/features/cadets";
import { getCadet } from "@/features/cadets/server";
import { speakerLinksOf } from "@/features/speakers/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.cadets.title };

export default async function AdminCadetPage({ params }: PageProps<"/admin/cadetes/[uid]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "cadets");
  const { uid } = await params;

  const [found, squads, canEdit, canManageTeam, canEditTalks, teamRole, speakerLinks] = await Promise.all([
    getCadet(cadetsDeps, { uid: session.uid, role: session.role }, { uid }),
    squadStore.list(),
    mayEdit(session, "cadets"),
    mayEdit(session, "team"),
    mayEdit(session, "talks"),
    teamDeps.team.roleOf(uid),
    speakerLinksOf(speakerAccessDeps, { role: session.role }, uid),
  ]);
  if (!found.ok) {
    if (found.error.code === "not-found") notFound();
    throw new Error("Could not read the cadet");
  }
  const { cadet, account } = found.value;
  // Who set the ticket by hand, by name: it only decorates the page, so an account that cannot be read leaves it out.
  const setter = cadet.ticketSource === "manual" && cadet.ticketSetBy ? await cadetsDeps.accounts.lookup(cadet.ticketSetBy) : null;
  const squadOptions = squads.ok ? squads.value.map((squad) => ({ id: squad.id, name: squad.name })) : [];

  return (
    <ScreenEnter>
      <CadetDetailView
        cadet={{
          uid: cadet.uid,
          alias: cadet.alias,
          name: account?.displayName ?? null,
          email: account?.email ?? null,
          squad: cadet.squad,
          squadName: cadet.squad ? (squadOptions.find((squad) => squad.id === cadet.squad)?.name ?? cadet.squad) : null,
          xp: cadet.xp,
          credits: cadet.credits,
          attended: cadet.attendedAt !== null,
          banned: cadet.banned,
          ticket: cadet.ticket,
          ticketSource: cadet.ticketSource,
          ticketSetByName: setter?.ok && setter.value ? (setter.value.displayName ?? setter.value.email) : null,
          createdAt: cadet.createdAt?.toISOString() ?? null,
          attendedAt: cadet.attendedAt?.toISOString() ?? null,
          activity: cadet.activity,
          bannedAt: cadet.bannedAt?.toISOString() ?? null,
          banReason: cadet.banReason,
          account: account ? { email: account.email, displayName: account.displayName, disabled: account.disabled } : null,
        }}
        squads={squadOptions}
        rename={renameCadetAction}
        changeSquad={changeCadetSquadAction}
        changeTicket={changeCadetTicketAction}
        ban={banCadetAction}
        unban={unbanCadetAction}
        remove={deleteCadetAction}
        // Giving a role is the Equipo screen's job (same actions, same rules); it needs the team permission, and a failed read of their role hides it.
        // Linking a speaker is the Speakers screen's job (same rules and audit); it needs the talks permission, and a failed read hides it.
        speaker={canEditTalks && speakerLinks.ok ? { ...speakerLinks.value, link: linkSpeakerAccountAction, unlink: unlinkSpeakerAction } : undefined}
        team={canManageTeam && teamRole.ok ? { role: teamRole.value, assignable: session.adminScope === "global" ? MANAGED_ROLES : (["staff"] as const), give: grantRoleAction, take: revokeRoleAction } : undefined}
        canDelete={session.adminScope === "global"}
        canEdit={canEdit}
        isSelf={cadet.uid === session.uid}
        listHref={ROUTES.adminCadets}
      />
    </ScreenEnter>
  );
}
