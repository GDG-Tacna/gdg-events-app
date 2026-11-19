import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  leaderboardDeps,
  stageDeps,
} from "@/app-shell/composition/leaderboard.server";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { requireRole } from "@/app-shell/guards";
import { loadConsoleAgenda } from "@/app-shell/rundown/agenda.server";
import { StageScreenBound } from "@/app-shell/StageScreenBound";
import {
  currentEditionId,
  getFleetBoard,
  getStage,
} from "@/features/leaderboard/server";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = {
  title: `${copy.stage.title} · ${copy.brand.name}`,
};

/** The stage screen for the projector. Admins only: its live listeners read with the admin's own session. */
export default async function StagePage({ searchParams }: { searchParams?: Promise<{ vista?: string | string[] }> } = {}) {
  // `?vista=previa` is the console's small copy of this screen (it does not announce itself as a projector).
  const preview = (await searchParams)?.vista === "previa";
  const admin = await requireRole(["admin"]);
  if (!(await moduleOn("leaderboard"))) notFound();

  const [eventId, stage, board, catalog, squadsOn, pollsOn, agenda] = await Promise.all(
    [
      currentEditionId(),
      getStage(stageDeps),
      getFleetBoard(leaderboardDeps),
      squadCatalog.list(),
      moduleOn("squads"),
      moduleOn("polls"),
      // The next talk for the waiting screen and the speaker under a talk's QR: without them the screen still works.
      loadConsoleAgenda({ uid: admin.uid, role: "admin" }).catch(() => null),
    ],
  );
  if (!stage.ok) throw new Error("Could not read the stage");
  // The squads' names and logos are decoration for the screen: without them it still ranks.
  const squads = catalog.ok ? catalog.value : [];

  return (
    <>
      <StageScreenBound
        eventId={eventId}
        squads={squads.map(({ id, name, active }) => ({ id, name, active }))}
        sprites={Object.fromEntries(
          squads.map((squad) => [
            squad.id,
            { ...squad.sprite, logoUrl: squad.logo?.url ?? null },
          ]),
        )}
        initialStage={stage.value}
        initialBoard={board.ok ? board.value : null}
        squadsOn={squadsOn}
        pollsOn={FEATURES.polls && pollsOn}
        talkQrOn={FEATURES.checkins}
        agenda={agenda ?? []}
        preview={preview}
      />
    </>
  );
}
