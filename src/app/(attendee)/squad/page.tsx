import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import { squadDeps } from "@/app-shell/composition/squads.server";
import { requireRole } from "@/app-shell/guards";
import { assignSquadAction } from "@/app-shell/squads/assign-squad.action";
import { getAttendee } from "@/features/attendee/server";
import { SquadReveal, offeredSquads } from "@/features/squads";
import { listSquads } from "@/features/squads/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = {
  title: `${copy.reveal.title} · ${copy.brand.name}`,
};

export default async function SquadPage() {
  // Squads are optional: with the flag off the route does not exist.
  if (!(await moduleOn("squads"))) notFound();

  // Visitors go to /login and users without a profile go to onboarding (inside the guard).
  const session = await requireRole(["attendee"]);

  const [attendee, squads] = await Promise.all([
    getAttendee({ attendees: attendeeDeps.attendees }, session.uid),
    listSquads({ catalog: squadDeps.catalog }),
  ]);
  // A failed read surfaces through the route error boundary instead of showing a wrong screen.
  if (!attendee.ok) throw new Error("Could not read the attendee profile");
  if (!squads.ok) throw new Error("Could not read the squad catalog");
  if (attendee.value === null) redirect(ROUTES.onboarding);
  // No squad to offer (none loaded in this edition yet, or every one retired): nothing to reveal, so the cadet
  // continues to the dashboard (onboarding always comes here) instead of a "not found" page.
  if (offeredSquads(squads.value).length === 0 && attendee.value.squad === null) redirect(ROUTES.dashboard);

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe pb-safe px-space-4 py-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <SquadReveal
            squads={squads.value}
            assign={assignSquadAction}
            initialSquad={attendee.value.squad}
            continueHref={ROUTES.dashboard}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
