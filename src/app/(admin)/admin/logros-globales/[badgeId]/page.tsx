import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateGlobalBadgeAction } from "@/app-shell/achievements/global-manage.actions";
import { globalAchievementAdminDeps } from "@/app-shell/composition/achievements.server";
import { requireRole } from "@/app-shell/guards";
import { uploadGlobalImageAction } from "@/app-shell/media/upload.action";
import { requireSection } from "@/app-shell/permissions.server";
import { GlobalBadgeForm } from "@/features/achievements";
import { listManagedGlobalBadges } from "@/features/achievements/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.achievements.global.editTitle };

export default async function EditGlobalAchievementPage({ params }: { params: Promise<{ badgeId: string }> }) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");
  if (session.adminScope !== "global") notFound();

  const { badgeId } = await params;
  const listed = await listManagedGlobalBadges(globalAchievementAdminDeps, {
    uid: session.uid,
    role: session.role,
    adminScope: session.adminScope,
  });
  if (!listed.ok) throw new Error("Could not read global badges");
  const badge = listed.value.find((candidate) => candidate.id === badgeId);
  if (!badge) notFound();

  return (
    <ScreenEnter>
      <GlobalBadgeForm
        mode="edit"
        badge={badge}
        save={updateGlobalBadgeAction}
        upload={uploadGlobalImageAction}
        listHref={ROUTES.adminGlobalAchievements}
      />
    </ScreenEnter>
  );
}
