import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { squadDeps } from "@/app-shell/composition/squads.server";
import { dashboardDeps, openMissionsSummary } from "@/app-shell/composition/dashboard.server";
import { voteDeps } from "@/app-shell/composition/polls.server";
import { avatarDeps } from "@/app-shell/composition/avatar.server";
import { leaderboardDeps } from "@/app-shell/composition/leaderboard.server";
import { currentEconomy, squadCardDeps } from "@/app-shell/composition/economy.server";
import { requireAttendee } from "@/app-shell/guards";
import { DashboardView, MissionsCard, decideSquadCallout, getAttendeeOverview } from "@/features/dashboard";
import { SquadCreditsCard } from "@/features/economy";
import { getSquadStanding } from "@/features/economy/server";
import { StandingCard } from "@/features/leaderboard";
import { getCadetStanding } from "@/features/leaderboard/server";
import { LivePollCard } from "@/features/polls";
import { getCadetPoll } from "@/features/polls/server";
import { getAvatarLook } from "@/features/avatar/server";
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
  const squadsOn = await moduleOn("squads");
  // With squads switched off for the edition nothing about the attendee's squad shows.
  const squadId = squadsOn ? overview.value.squadId : null;
  const squad = squadId === null ? null : (squads.find((candidate) => candidate.id === squadId) ?? null);

  const squadCallout = decideSquadCallout({
    featureEnabled: squadsOn,
    squadId,
    availableSquads: offeredSquads(squads).length,
  });

  const [squadCredits, standing, missions, poll, avatarLook] = await Promise.all([
    squadId === null ? null : squadStanding(squadId),
    (await moduleOn("leaderboard")) ? fleetStanding(session.uid) : null,
    (await moduleOn("missions")) ? openMissionsSummary() : null,
    FEATURES.polls && (await moduleOn("polls")) ? livePoll(session.uid) : null,
    getAvatarLook(avatarDeps, session.uid),
  ]);

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-safe-space-6 mx-auto w-full max-w-[520px] min-[760px]:max-w-[960px]">
        <ScreenEnter>
          <DashboardView
            overview={overview.value}
            squadCallout={squadCallout}
            squadBadge={squad ? <SquadBadge squad={squad} /> : <RetiredSquadChip />}
            squadPreviews={offeredSquads(squads)}
            squadHref={ROUTES.squad}
            squadCreditsSlot={squadCredits ? <SquadCreditsCard balance={squadCredits.wallet.balance} prizes={squadCredits.prizes} /> : undefined}
            standingSlot={standing ? <StandingCard standing={standing} alias={overview.value.alias} squad={squad?.name ?? null} /> : undefined}
            qrHref={FEATURES.checkins ? ROUTES.pass : undefined}
            networkHref={(await moduleOn("network")) ? ROUTES.network : undefined}
            avatarLook={avatarLook}
            avatarHref={ROUTES.avatar}
            missionsSlot={missions ? <MissionsCard href={ROUTES.missions} xp={missions.xp} quadrants={missions.quadrants} /> : undefined}
            installSlot={<InstallHint />}
            pollSlot={poll ? <LivePollCard poll={poll} href={ROUTES.poll} /> : undefined}
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

/** The open poll with the cadet's vote. Decoration: a failed read leaves the card out. */
async function livePoll(uid: string) {
  const current = await getCadetPoll(voteDeps, uid);
  return current.ok ? current.value : null;
}

/** An attendee whose squad was retired from the catalog keeps a sensible, plain label. */
function RetiredSquadChip() {
  return (
    <span className="bg-secondary border-input text-muted-foreground type-caption rounded-pill border px-space-3 py-space-1 inline-flex">
      {copy.dashboard.squadRetired}
    </span>
  );
}
