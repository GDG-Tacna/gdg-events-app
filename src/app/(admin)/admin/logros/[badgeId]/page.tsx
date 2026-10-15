import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadAchievementFormOptions } from "@/app-shell/achievements/form-options.server";
import { updateBadgeAction } from "@/app-shell/achievements/manage.actions";
import { achievementAdminDeps } from "@/app-shell/composition/achievements.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { BadgeForm } from "@/features/achievements";
import { listManagedBadges } from "@/features/achievements/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.achievements.form.editTitle };

export default async function AdminEditBadgePage({ params }: { params: Promise<{ badgeId: string }> }) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");
  const { badgeId } = await params;

  const [badges, options] = await Promise.all([listManagedBadges(achievementAdminDeps, { uid: session.uid, role: session.role }), loadAchievementFormOptions()]);
  if (!badges.ok) throw new Error("Could not read the badges");
  const badge = badges.value.find((candidate) => candidate.id === badgeId);
  if (!badge) notFound();

  return (
    <ScreenEnter>
      <BadgeForm
        upload={uploadImageAction}
        mode="edit"
        badge={badge}
        save={updateBadgeAction}
        quadrants={options.quadrants}
        missions={options.missions}
        levels={options.levels}
        listHref={ROUTES.adminAchievements}
      />
    </ScreenEnter>
  );
}
