import type { Metadata } from "next";
import { teamDeps } from "@/app-shell/composition/admin.server";
import { cadetsDeps } from "@/app-shell/composition/cadets.server";
import { squadStore } from "@/app-shell/composition/squads.server";
import { requireRole } from "@/app-shell/guards";
import { requireSection } from "@/app-shell/permissions.server";
import { listTeam } from "@/features/admin/server";
import { CadetsListView } from "@/features/cadets";
import { CADETS_SEARCH_MAX, CADETS_SEARCH_MIN, listCadets } from "@/features/cadets/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.cadets.title };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function AdminCadetsPage({ searchParams }: PageProps<"/admin/cadetes">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "cadets");
  const params = await searchParams;
  // A search shorter than the minimum is no search: the box asks as the person types, and one letter shows everyone.
  const typed = first(params.q).slice(0, CADETS_SEARCH_MAX).trim();
  const search = typed.length >= CADETS_SEARCH_MIN ? typed : "";
  const after = first(params.despues) || null;

  const [page, squads, team] = await Promise.all([
    listCadets(cadetsDeps, { uid: session.uid, role: session.role }, { search, after }),
    squadStore.list(),
    listTeam(teamDeps, { uid: session.uid, role: session.role, adminScope: session.adminScope ?? "edition" }),
  ]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!page.ok) throw new Error("Could not read the cadets");
  // The squads' names only label the rows: without them each row says the squad's id.
  // The team's roles only mark the rows: without them the list simply shows no marks.
  const teamRoles = new Map(team.ok ? team.value.map((member) => [member.uid, member.role] as const) : []);
  const squadNames = new Map(squads.ok ? squads.value.map((squad) => [squad.id, squad.name] as const) : []);

  const nextHref = page.value.next ? `${ROUTES.adminCadets}?${new URLSearchParams({ ...(search ? { q: search } : {}), despues: page.value.next })}` : null;

  return (
    <ScreenEnter>
      <CadetsListView
        cadets={page.value.cadets.map((cadet) => ({
          uid: cadet.uid,
          alias: cadet.alias,
          name: cadet.identity?.displayName ?? null,
          email: cadet.identity?.email ?? null,
          squadName: cadet.squad ? (squadNames.get(cadet.squad) ?? cadet.squad) : null,
          xp: cadet.xp,
          credits: cadet.credits,
          attended: cadet.attendedAt !== null,
          banned: cadet.banned,
          ticket: cadet.ticket,
          teamRole: teamRoles.get(cadet.uid) ?? null,
        }))}
        total={page.value.total}
        search={search}
        nextHref={nextHref}
        hrefs={{ list: ROUTES.adminCadets, detailBase: ROUTES.adminCadets, tickets: ROUTES.adminCadetTickets }}
      />
    </ScreenEnter>
  );
}
