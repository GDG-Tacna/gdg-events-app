import type { Metadata } from "next";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { loadMissionFormOptions } from "@/app-shell/missions/form-options.server";
import { createMissionAction } from "@/app-shell/missions/manage.actions";
import { MissionForm } from "@/features/missions";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.missions.form.createTitle };

export default async function AdminNewMissionPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "missions");
  const options = await loadMissionFormOptions({ uid: session.uid, role: session.role });

  return (
    <ScreenEnter>
      <MissionForm
        upload={uploadImageAction}
        mode="create"
        save={createMissionAction}
        quadrants={options.quadrants}
        checkpoints={options.checkpoints}
        listHref={ROUTES.adminMissions}
        creditDefaults={options.creditDefaults}
        minigames={options.minigames}
      />
    </ScreenEnter>
  );
}
