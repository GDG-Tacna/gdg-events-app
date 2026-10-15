import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { squadDeps } from "@/app-shell/composition/squads.server";
import { dashboardDeps, openMissionsSummary } from "@/app-shell/composition/dashboard.server";
import { leaderboardDeps } from "@/app-shell/composition/leaderboard.server";
import { networkStore } from "@/app-shell/composition/network.server";
import { raffleCardDeps } from "@/app-shell/composition/raffle.server";
import { currentEconomy, squadCardDeps } from "@/app-shell/composition/economy.server";
import { requireAttendee } from "@/app-shell/guards";
import { DashboardView, MissionsCard, decideSquadCallout, getAttendeeOverview } from "@/features/dashboard";
import { SquadCreditsCard } from "@/features/economy";
import { getSquadStanding } from "@/features/economy/server";
import { StandingCard } from "@/features/leaderboard";
import { getCadetStanding } from "@/features/leaderboard/server";
import { NetworkCard } from "@/features/network";
import { countContacts } from "@/features/network/server";
import { PassCard } from "@/features/pass";
import { RaffleTicketsCard } from "@/features/raffle";
import { getCadetTickets } from "@/features/raffle/server";
import { InstallHint } from "@/features/pwa";
import { SquadBadge, offeredSquads } from "@/features/squads";
import { listSquads } from "@/features/squads/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.dashboard.title} · ${copy.brand.name}` };

export default async function DashboardPage() {
  // Visitors go to /login, users without a role go to onboarding, and staff or admin go to their own home.
  const session = await requireAttendee();

  const [overview, catalog] = await Promise.all([
    getAttendeeOverview(dashboardDeps, session.uid),
    listSquads({ catalog: squadDeps.catalog }),
  ]);

  // A failed read surfaces through the route error boundary instead of drawing a card with made-up numbers.
  if (!overview.ok) throw new Error("Could not read the attendee profile");
  // An attendee role without a profile in this edition (a new edition, or an interrupted registration) registers again.
  if (overview.value === null) redirect(ROUTES.onboarding);

  // The squad catalog is optional decoration: if it cannot be read the dashboard still works, without the squad parts.
  const squads = catalog.ok ? catalog.value : [];
  const { squadId } = overview.value;
  const squad = squadId === null ? null : (squads.find((candidate) => candidate.id === squadId) ?? null);

  const squadCallout = decideSquadCallout({
    featureEnabled: (await moduleOn("squads")),
    squadId,
    availableSquads: offeredSquads(squads).length,
  });

  const [squadCredits, contacts, standing, raffle, missions] = await Promise.all([
    squadId === null ? null : squadStanding(squadId),
    (await moduleOn("network")) ? contactCount(session.uid) : null,
    (await moduleOn("leaderboard")) ? fleetStanding(session.uid) : null,
    (await moduleOn("raffle")) ? raffleTickets(session.uid, overview.value.credits) : null,
    (await moduleOn("missions")) ? openMissionsSummary() : null,
  ]);

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe pb-safe px-space-4 py-space-6 mx-auto w-full max-w-[520px] min-[760px]:max-w-[960px]">
        <ScreenEnter>
          <DashboardView
            overview={overview.value}
            squadCallout={squadCallout}
            squadBadge={squad ? <SquadBadge squad={squad} /> : <RetiredSquadChip />}
            squadPreviews={offeredSquads(squads)}
            squadHref={ROUTES.squad}
            squadCreditsSlot={squadCredits ? <SquadCreditsCard balance={squadCredits.wallet.balance} prizes={squadCredits.prizes} /> : undefined}
            standingSlot={standing ? <StandingCard standing={standing} alias={overview.value.alias} squad={squad?.name ?? null} /> : undefined}
            raffleSlot={raffle ? <RaffleTicketsCard tickets={raffle} /> : undefined}
            networkSlot={contacts === null ? undefined : <NetworkCard href={ROUTES.network} contacts={contacts} />}
            passSlot={FEATURES.checkins ? <PassCard href={ROUTES.pass} /> : undefined}
            qrHref={FEATURES.checkins ? ROUTES.pass : undefined}
            networkHref={(await moduleOn("network")) ? ROUTES.network : undefined}
            missionsSlot={missions ? <MissionsCard href={ROUTES.missions} xp={missions.xp} quadrants={missions.quadrants} /> : undefined}
            installSlot={<InstallHint />}
          />
        </ScreenEnter>
      </main>
    </>
  );
}

/**
 * The member's squad credits and prizes, when squad credits are on in this edition. Optional decoration:
 * a failed read leaves the card out instead of failing the dashboard.
 */
async function squadStanding(squadId: string) {
  const economy = await currentEconomy();
  if (!economy.squadCreditsEnabled) return null;
  const standing = await getSquadStanding(squadCardDeps, squadId);
  return standing.ok ? standing.value : null;
}

/** The cadet's place in the fleet and the top 10. Decoration: a failed read leaves the card out. */
async function fleetStanding(uid: string) {
  const standing = await getCadetStanding(leaderboardDeps, uid);
  return standing.ok ? standing.value : null;
}

/**
 * The cadet's raffle tickets (their G-Credits of this edition), only while G-Credits are on. Decoration: a failed
 * read leaves the card out.
 */
async function raffleTickets(uid: string, credits: number) {
  const economy = await currentEconomy();
  if (!economy.creditsEnabled) return null;
  const tickets = await getCadetTickets(raffleCardDeps, uid, credits);
  return tickets.ok ? tickets.value : null;
}

/** How many contacts the cadet has made, for the Red card. Decoration: a failed read leaves the card out. */
async function contactCount(uid: string) {
  const counted = await countContacts({ contacts: networkStore }, uid);
  return counted.ok ? counted.value : null;
}

/** An attendee whose squad was retired from the catalog keeps a sensible, plain label. */
function RetiredSquadChip() {
  return (
    <span className="bg-secondary border-input text-muted-foreground type-caption rounded-pill border px-space-3 py-space-1 inline-flex">
      {copy.dashboard.squadRetired}
    </span>
  );
}
