import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { agendaDeps } from "@/app-shell/composition/talks.server";
import { requireAttendee } from "@/app-shell/guards";
import { VenueMapView } from "@/features/quadrants";
import { getGalaxyMap } from "@/features/quadrants/server";
import { AgendaView } from "@/features/talks";
import { getAgenda } from "@/features/talks/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.map.title} · ${copy.brand.name}` };

/** The Mapa tab's views: the venue plan, and the agenda of talks (whose rooms are on the plan). */
const VIEWS = [
  { id: "plano", label: copy.map.views.plan },
  { id: "agenda", label: copy.map.views.agenda },
] as const;

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const mapOn = await moduleOn("map");
  // Talks are part of the core: with the map switched off this screen is only the agenda.
  if (!mapOn && !FEATURES.checkins) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home.
  const session = await requireAttendee();
  const { vista } = await searchParams;
  // The agenda needs check-ins (talks are proven by scanning their code); anything else shows the plan.
  const view = !mapOn || (vista === "agenda" && FEATURES.checkins) ? "agenda" : "plano";

  const [galaxy, agenda] = await Promise.all([getGalaxyMap(galaxyDeps), view === "agenda" ? getAgenda(agendaDeps, session.uid) : null]);
  // The route's error boundary shows a retry; the cause is already logged by the adapter.
  if (!galaxy.ok) throw new Error("Could not read the galaxy map");
  if (agenda && !agenda.ok) throw new Error("Could not read the agenda");

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-space-6 min-[760px]:pt-safe-space-8 min-[760px]:pb-space-8 gap-space-5 mx-auto flex w-full max-w-[520px] flex-col min-[760px]:max-w-[880px]">
        {mapOn && FEATURES.checkins ? (
          <nav aria-label={copy.map.views.label} className="bg-surface border-border p-space-1 grid grid-cols-2 rounded-md border">
            {VIEWS.map((option) => (
              <Link
                key={option.id}
                href={option.id === "plano" ? ROUTES.map : `${ROUTES.map}?vista=agenda`}
                aria-current={view === option.id ? "page" : undefined}
                className={cn(
                  "type-label focus-visible:ring-ring inline-flex h-11 items-center justify-center rounded-sm focus-visible:ring-[3px] focus-visible:outline-none",
                  view === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <ScreenEnter>
          {agenda?.ok ? (
            <AgendaView items={agenda.value} rooms={galaxy.value.quadrants.map(({ id, name }) => ({ id, name }))} />
          ) : (
            <VenueMapView galaxy={galaxy.value} />
          )}
        </ScreenEnter>
      </main>
    </>
  );
}
