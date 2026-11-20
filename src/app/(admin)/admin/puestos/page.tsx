import type { Metadata } from "next";
import { createCheckpointAction, deleteCheckpointAction, editCheckpointAction, setCheckpointActiveAction } from "@/app-shell/checkpoints/manage.actions";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { rankDeps } from "@/app-shell/composition/ranks.server";
import { mayDeleteItems } from "@/app-shell/deletion.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { CheckpointsAdminView, type CheckpointLockReason } from "@/features/checkpoints";
import { getEditionLadder } from "@/features/attendee/server";
import { listCheckpoints, listIdentityLocks, listServePoints } from "@/features/checkpoints/server";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { rankName } from "@/shared/copy/rank-name";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.checkpoints.title };

export default async function AdminCheckpointsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "checkpoints");
  const actor = { uid: session.uid, role: session.role };

  const [checkpoints, ladder, canDelete] = await Promise.all([listCheckpoints(checkpointAdminDeps, actor), getEditionLadder(rankDeps), mayDeleteItems(session)]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!checkpoints.ok) throw new Error("Could not read the checkpoints");
  // Talks have their own screen (Charlas).
  const stations = checkpoints.value.filter((checkpoint) => checkpoint.kind !== "talk");

  // Why each puesto's kind and id cannot change, for the edit dialog (the server checks again on save).
  const identity = await listIdentityLocks(checkpointAdminDeps, actor, stations);
  if (!identity.ok) throw new Error("Could not read what refers to the checkpoints");
  const locks: Record<string, CheckpointLockReason | null> = {};
  for (const checkpoint of stations) locks[checkpoint.id] = identity.value[checkpoint.id] ?? (canDelete ? null : "edition-locked");

  // How many cadets each open puesto has scanned, for its card. The count only decorates: a failed read shows none instead of failing the page.
  const served = await listServePoints(serveDeps, actor);
  const counts = served.ok ? Object.fromEntries(served.value.map((point) => [point.id, point.servedCount])) : undefined;

  return (
    <ScreenEnter>
      <CheckpointsAdminView
        checkpoints={stations}
        create={createCheckpointAction}
        edit={editCheckpointAction}
        setActive={setCheckpointActiveAction}
        remove={deleteCheckpointAction}
        upload={uploadImageAction}
        locks={locks}
        qrBase={ROUTES.adminQr}
        scanBase={ROUTES.adminCheckpointScan}
        counts={counts}
        canDelete={canDelete}
        levels={ladder.map((rank) => ({ level: rank.level, name: rankName(rank.id, rank.level, rank.name) }))}
      />
    </ScreenEnter>
  );
}
