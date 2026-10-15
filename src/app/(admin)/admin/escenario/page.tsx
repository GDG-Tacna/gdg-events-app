import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { leaderboardDeps, stageDeps } from "@/app-shell/composition/leaderboard.server";
import { requireRole } from "@/app-shell/guards";
import { updateStageAction } from "@/app-shell/leaderboard/stage.actions";
import { StageControlView } from "@/features/leaderboard";
import { getFleetBoard, getStage } from "@/features/leaderboard/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.stage.title };

export default async function AdminStagePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "stage");
  if (!(await moduleOn("leaderboard"))) notFound();

  const [stage, live] = await Promise.all([getStage(stageDeps), getFleetBoard(leaderboardDeps)]);
  if (!stage.ok) throw new Error("Could not read the stage");

  return (
    <ScreenEnter>
      {/* The live preview is decoration: without it the controls still work. */}
      <StageControlView stage={stage.value} live={live.ok ? live.value : null} run={updateStageAction} screenHref={ROUTES.stage} />
    </ScreenEnter>
  );
}
