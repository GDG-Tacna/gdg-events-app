import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createGlobalBadgeAction } from "@/app-shell/achievements/global-manage.actions";
import { requireRole } from "@/app-shell/guards";
import { uploadGlobalImageAction } from "@/app-shell/media/upload.action";
import { requireSection } from "@/app-shell/permissions.server";
import { GlobalBadgeForm } from "@/features/achievements";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.achievements.global.createTitle };

export default async function NewGlobalAchievementPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");
  if (session.adminScope !== "global") notFound();

  return (
    <ScreenEnter>
      <GlobalBadgeForm
        mode="create"
        save={createGlobalBadgeAction}
        upload={uploadGlobalImageAction}
        listHref={ROUTES.adminGlobalAchievements}
      />
    </ScreenEnter>
  );
}
