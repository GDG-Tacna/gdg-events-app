import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { minigameViewDeps } from "@/app-shell/composition/minigames.server";
import { requireAttendee } from "@/app-shell/guards";
import { finishMinigameAction, startMinigameAction } from "@/app-shell/minigames/play.actions";
import { MinigamePlayer } from "@/features/minigames";
import { getMinigameOffer } from "@/features/minigames/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.minigames.offer.label} · ${copy.brand.name}` };

/**
 * A mission's mini-game, full screen (no bottom bar, so nothing is tapped by mistake while playing). Only a
 * mission with an unused or running attempt opens it; anything else goes back to the mission.
 */
export default async function MinigamePage({ params }: { params: Promise<{ missionId: string }> }) {
  if (!(await moduleOn("missions")) || !(await moduleOn("minigames"))) notFound();
  const session = await requireAttendee();
  const { missionId } = await params;
  const missionHref = `${ROUTES.missions}/${missionId}`;

  const offer = await getMinigameOffer(minigameViewDeps, session.uid, missionId);
  if (!offer.ok) throw new Error("Could not read the mini-game");
  if (!offer.value || offer.value.state === "won" || offer.value.state === "lost") redirect(missionHref);

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe pb-safe px-space-4 py-space-6 mx-auto w-full max-w-[520px]">
        <ScreenEnter>
          <MinigamePlayer
            missionId={missionId}
            offer={offer.value}
            start={startMinigameAction}
            finish={finishMinigameAction}
            backHref={missionHref}
            achievementsHref={(await moduleOn("achievements")) ? ROUTES.achievements : undefined}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
