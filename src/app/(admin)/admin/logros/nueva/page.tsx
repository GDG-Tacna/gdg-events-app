import type { Metadata } from "next";
import { loadAchievementFormOptions } from "@/app-shell/achievements/form-options.server";
import { createBadgeAction } from "@/app-shell/achievements/manage.actions";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { BadgeForm } from "@/features/achievements";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.achievements.form.createTitle };

export default async function AdminNewBadgePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");
  const options = await loadAchievementFormOptions();

  return (
    <ScreenEnter>
      <BadgeForm
        upload={uploadImageAction} mode="create" save={createBadgeAction} quadrants={options.quadrants} missions={options.missions} levels={options.levels} listHref={ROUTES.adminAchievements} />
    </ScreenEnter>
  );
}
