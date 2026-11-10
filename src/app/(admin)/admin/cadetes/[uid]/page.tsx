import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { banCadetAction, changeCadetSquadAction, deleteCadetAction, renameCadetAction, unbanCadetAction } from "@/app-shell/cadets/manage.actions";
import { cadetsDeps } from "@/app-shell/composition/cadets.server";
import { squadStore } from "@/app-shell/composition/squads.server";
import { requireRole } from "@/app-shell/guards";
import { mayEdit, requireSection } from "@/app-shell/permissions.server";
import { CadetDetailView } from "@/features/cadets";
import { getCadet } from "@/features/cadets/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.cadets.title };

export default async function AdminCadetPage({ params }: PageProps<"/admin/cadetes/[uid]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "cadets");
  const { uid } = await params;

  const [found, squads, canEdit] = await Promise.all([getCadet(cadetsDeps, { uid: session.uid, role: session.role }, { uid }), squadStore.list(), mayEdit(session, "cadets")]);
  if (!found.ok) {
    if (found.error.code === "not-found") notFound();
    throw new Error("Could not read the cadet");
  }
  const { cadet, account } = found.value;
  const squadOptions = squads.ok ? squads.value.map((squad) => ({ id: squad.id, name: squad.name })) : [];

  return (
    <ScreenEnter>
      <CadetDetailView
        cadet={{
          uid: cadet.uid,
          alias: cadet.alias,
          squad: cadet.squad,
          squadName: cadet.squad ? (squadOptions.find((squad) => squad.id === cadet.squad)?.name ?? cadet.squad) : null,
          xp: cadet.xp,
          credits: cadet.credits,
          attended: cadet.attendedAt !== null,
          banned: cadet.banned,
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
        ban={banCadetAction}
        unban={unbanCadetAction}
        remove={deleteCadetAction}
        canDelete={session.adminScope === "global"}
        canEdit={canEdit}
        isSelf={cadet.uid === session.uid}
        listHref={ROUTES.adminCadets}
      />
    </ScreenEnter>
  );
}
