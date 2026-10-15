import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leaderboardDeps, stageDeps } from "@/app-shell/composition/leaderboard.server";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { requireRole } from "@/app-shell/guards";
import { StageScreenBound } from "@/app-shell/StageScreenBound";
import { currentEditionId, getFleetBoard, getStage } from "@/features/leaderboard/server";
import { copy } from "@/shared/copy/es";
import { SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.stage.title} · ${copy.brand.name}` };

/** The stage screen for the projector. Admins only: its live listeners read with the admin's own session. */
export default async function StagePage() {
  await requireRole(["admin"]);
  if (!(await moduleOn("leaderboard"))) notFound();

  const [eventId, stage, board, catalog] = await Promise.all([currentEditionId(), getStage(stageDeps), getFleetBoard(leaderboardDeps), squadCatalog.list()]);
  if (!stage.ok) throw new Error("Could not read the stage");
  // The squads' names and logos are decoration for the screen: without them it still ranks.
  const squads = catalog.ok ? catalog.value : [];

  return (
    <>
      <SpaceBackground />
      <StageScreenBound
        eventId={eventId}
        squads={squads.map(({ id, name, active }) => ({ id, name, active }))}
        sprites={Object.fromEntries(squads.map((squad) => [squad.id, { ...squad.sprite, logoUrl: squad.logo?.url ?? null }]))}
        initialStage={stage.value}
        initialBoard={board.ok ? board.value : null}
      />
    </>
  );
}
