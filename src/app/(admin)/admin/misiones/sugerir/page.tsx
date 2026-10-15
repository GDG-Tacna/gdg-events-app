import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { loadMissionFormOptions } from "@/app-shell/missions/form-options.server";
import { createMissionAction } from "@/app-shell/missions/manage.actions";
import { suggestMissionsAction } from "@/app-shell/missions/suggest.action";
import { SuggestMissionsView } from "@/features/missions";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.missions.suggestions.title };

export default async function AdminSuggestMissionsPage() {
  if (!FEATURES.missionSuggestions) notFound();
  const session = await requireRole(["admin"]);
  await requireSection(session, "missions");
  const options = await loadMissionFormOptions({ uid: session.uid, role: session.role });

  return (
    <ScreenEnter>
      <SuggestMissionsView
        upload={uploadImageAction}
        quadrants={options.quadrants}
        checkpoints={options.checkpoints}
        suggest={suggestMissionsAction}
        save={createMissionAction}
        listHref={ROUTES.adminMissions}
        creditDefaults={options.creditDefaults}
      />
    </ScreenEnter>
  );
}
