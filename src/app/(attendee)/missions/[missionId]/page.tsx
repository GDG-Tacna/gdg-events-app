import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enabledMinigames, minigameViewDeps } from "@/app-shell/composition/minigames.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { requireAttendee } from "@/app-shell/guards";
import { submitMissionAnswerAction } from "@/app-shell/missions/answer.action";
import { MinigameOfferCard } from "@/features/minigames";
import { getMinigameOffer } from "@/features/minigames/server";
import { MissionDetailView } from "@/features/missions";
import { getMissionBoard } from "@/features/missions/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.missions.title} · ${copy.brand.name}` };

export default async function MissionPage({ params }: PageProps<"/missions/[missionId]">) {
  if (!(await moduleOn("missions"))) notFound();
  const session = await requireAttendee();
  const { missionId } = await params;

  const [board, galaxy, games] = await Promise.all([
    getMissionBoard(missionDeps, session.uid),
    getGalaxyMap(galaxyDeps),
    (await moduleOn("minigames")) ? enabledMinigames() : undefined,
  ]);
  if (!board.ok) throw new Error("Could not read the missions");
  // Only active missions are on the board: an unknown or inactive one is not found.
  const mission = board.value.missions.find((candidate) => candidate.id === missionId);
  if (!mission) notFound();

  // The bonus only decorates a completed mission: without it (off, none assigned, a failed read) the mission still shows.
  const offer = (await moduleOn("minigames")) && mission.status === "completed" ? await getMinigameOffer(minigameViewDeps, session.uid, missionId) : null;
  // The quadrant only decorates the mission: without the plan it shows without its tag.
  const quadrant = galaxy.ok ? (galaxy.value.quadrants.find((candidate) => candidate.id === mission.quadrantId) ?? null) : null;
  const bonus = offer?.ok && offer.value ? <MinigameOfferCard offer={offer.value} playHref={`${ROUTES.minigame}/${missionId}`} /> : undefined;

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe px-space-4 py-space-6 min-[760px]:py-space-8 mx-auto w-full max-w-[520px]">
        <ScreenEnter>
          <MissionDetailView
            mission={mission}
            answer={submitMissionAnswerAction}
            backHref={ROUTES.missions}
            scanHref={ROUTES.scan}
            passHref={FEATURES.checkins ? ROUTES.pass : undefined}
            quadrant={quadrant ? { name: quadrant.name, planet: quadrant.planet } : null}
            minigame={mission.minigame !== null && Boolean(games?.has(mission.minigame))}
            achievementsHref={(await moduleOn("achievements")) ? ROUTES.achievements : undefined}
            bonusSlot={bonus}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
