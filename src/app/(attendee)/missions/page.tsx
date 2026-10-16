import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enabledMinigames } from "@/app-shell/composition/minigames.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { storyTitleSource } from "@/app-shell/composition/odyssey.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { requireAttendee } from "@/app-shell/guards";
import { MissionBoardView, type BoardQuadrant } from "@/features/missions";
import { getMissionBoard } from "@/features/missions/server";
import { getStoryTitle } from "@/features/odyssey/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.missions.title} · ${copy.brand.name}` };

export default async function MissionsPage() {
  if (!(await moduleOn("missions"))) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home.
  const session = await requireAttendee();

  const [board, galaxy, games, storyTitle] = await Promise.all([
    getMissionBoard(missionDeps, session.uid),
    getGalaxyMap(galaxyDeps),
    (await moduleOn("minigames")) ? enabledMinigames() : undefined,
    (await moduleOn("odyssey")) ? getStoryTitle(storyTitleSource) : null,
  ]);
  // The route's error boundary shows a retry; the cause is already logged by the adapters.
  if (!board.ok) throw new Error("Could not read the missions");

  // Quadrant names and planets only decorate the board: without them the missions are still listed.
  const quadrants: BoardQuadrant[] = galaxy.ok
    ? galaxy.value.quadrants.map(({ id, name, planet }) => ({ id, name, planet }))
    : [];

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-space-6 min-[760px]:pt-safe-space-8 min-[760px]:pb-space-8 mx-auto w-full max-w-[520px] min-[760px]:max-w-[880px]">
        <ScreenEnter>
          <MissionBoardView board={board.value} quadrants={quadrants} missionHref={(id) => `${ROUTES.missions}/${id}`} odysseyHref={(await moduleOn("odyssey")) ? ROUTES.odyssey : undefined}
            odysseyTitle={storyTitle}
            enabledGames={games} />
        </ScreenEnter>
      </main>
    </>
  );
}
