import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/app-shell/guards";
import { TeamCodeScreen } from "@/app-shell/team-code/TeamCodeScreen";
import { teamRoleOf } from "@/features/team-code/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.teamCode.title };
export const dynamic = "force-dynamic";

/**
 * «Mi código»: the rotating code a team member shows to cadets who want to meet them («Conoce a un organizador / voluntario»).
 * Staff show a volunteer's code, organizers and admins an organizer's; the server picks the role from the session, so
 * the screen cannot claim another one.
 */
export default async function TeamCodePage() {
  if (!FEATURES.checkins) notFound();
  const session = await requireRole(["staff"]);
  const role = teamRoleOf(session.role);
  if (role === null) notFound();

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={session.role === "admin" ? ROUTES.admin : ROUTES.staff} variant="ghost" size="sm" className="-ml-space-4">
            {copy.teamCode.back}
          </ButtonLink>
        </div>
        <p className="type-body text-muted-foreground text-center">{copy.teamCode.intro}</p>
        <TeamCodeScreen role={role} />
      </div>
    </ScreenEnter>
  );
}
