import type { Metadata } from "next";
import { createCheckpointAction, renameCheckpointAction, setCheckpointActiveAction, setFoodRequirementsAction } from "@/app-shell/checkpoints/manage.actions";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { rankDeps } from "@/app-shell/composition/ranks.server";
import { requireRole } from "@/app-shell/guards";
import { CheckpointsAdminView } from "@/features/checkpoints";
import { getEditionLadder } from "@/features/attendee/server";
import { listCheckpoints } from "@/features/checkpoints/server";
import { copy } from "@/shared/copy/es";
import { rankName } from "@/shared/copy/rank-name";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.checkpoints.title };

export default async function AdminCheckpointsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "checkpoints");

  const [checkpoints, ladder] = await Promise.all([listCheckpoints(checkpointAdminDeps, { uid: session.uid, role: session.role }), getEditionLadder(rankDeps)]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!checkpoints.ok) throw new Error("Could not read the checkpoints");

  return (
    <ScreenEnter>
      <CheckpointsAdminView
        // Talks have their own screen (Charlas).
        checkpoints={checkpoints.value.filter((checkpoint) => checkpoint.kind !== "talk")}
        create={createCheckpointAction}
        rename={renameCheckpointAction}
        setActive={setCheckpointActiveAction}
        setRequirements={setFoodRequirementsAction}
        levels={ladder.map((rank) => ({ level: rank.level, name: rankName(rank.id, rank.level, rank.name) }))}
      />
    </ScreenEnter>
  );
}
