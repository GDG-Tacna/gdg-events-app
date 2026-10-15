import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { missionAdminDeps } from "@/app-shell/composition/mission-admin.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { loadMissionFormOptions } from "@/app-shell/missions/form-options.server";
import { updateMissionAction } from "@/app-shell/missions/manage.actions";
import { MissionForm } from "@/features/missions";
import { listManagedMissions } from "@/features/missions/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.missions.form.editTitle };

export default async function AdminEditMissionPage({ params }: PageProps<"/admin/misiones/[missionId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "missions");
  const { missionId } = await params;
  const actor = { uid: session.uid, role: session.role };

  const [missions, options] = await Promise.all([listManagedMissions(missionAdminDeps, actor), loadMissionFormOptions(actor)]);
  if (!missions.ok) throw new Error("Could not read the missions");
  const mission = missions.value.find((candidate) => candidate.id === missionId);
  if (!mission) notFound();

  return (
    <ScreenEnter>
      <MissionForm
        upload={uploadImageAction}
        mode="edit"
        mission={mission}
        save={updateMissionAction}
        quadrants={options.quadrants}
        checkpoints={options.checkpoints}
        listHref={ROUTES.adminMissions}
        creditDefaults={options.creditDefaults}
        minigames={options.minigames}
      />
    </ScreenEnter>
  );
}
