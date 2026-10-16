import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  leaderboardDeps,
  stageDeps,
} from "@/app-shell/composition/leaderboard.server";
import { requireRole } from "@/app-shell/guards";
import { updateStageAction } from "@/app-shell/leaderboard/stage.actions";
import { StageControlView } from "@/features/leaderboard";
import { getFleetBoard, getStage } from "@/features/leaderboard/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { pollStore } from "@/app-shell/composition/polls.server";
import { comparePolls } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";

export const metadata: Metadata = { title: copy.admin.stage.title };

export default async function AdminStagePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "stage");
  if (!(await moduleOn("leaderboard"))) notFound();

  const [stage, live, squadsOn, polls] = await Promise.all([
    getStage(stageDeps),
    getFleetBoard(leaderboardDeps),
    moduleOn("squads"),
    showablePolls(),
  ]);
  if (!stage.ok) throw new Error("Could not read the stage");

  return (
    <ScreenEnter>
      {/* The live preview is decoration: without it the controls still work. */}
      <StageControlView
        stage={stage.value}
        live={live.ok ? live.value : null}
        run={updateStageAction}
        screenHref={ROUTES.stage}
        squadsOn={squadsOn}
        upload={uploadImageAction}
        polls={polls ?? undefined}
      />
    </ScreenEnter>
  );
}

/**
 * The polls that can go on screen (opened at some point), the open one first; `null` with polls off. A failed read
 * offers none rather than failing the stage controls.
 */
async function showablePolls() {
  if (!FEATURES.polls || !(await moduleOn("polls"))) return null;
  const polls = await pollStore.list();
  if (!polls.ok) return [];
  return [...polls.value]
    .sort(comparePolls)
    .flatMap((poll) =>
      poll.status === "draft"
        ? []
        : [{ id: poll.id, question: poll.question, status: poll.status }],
    );
}
