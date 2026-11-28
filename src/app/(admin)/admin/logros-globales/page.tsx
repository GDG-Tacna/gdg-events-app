import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  deleteGlobalBadgeAction,
  moveGlobalBadgeAction,
  seedGlobalBadgesAction,
  setGlobalBadgeActiveAction,
} from "@/app-shell/achievements/global-manage.actions";
import { globalAchievementAdminDeps } from "@/app-shell/composition/achievements.server";
import { requireRole } from "@/app-shell/guards";
import { requireSection } from "@/app-shell/permissions.server";
import { GlobalBadgesAdminView } from "@/features/achievements";
import { DEFAULT_GLOBAL_BADGES, listManagedGlobalBadges } from "@/features/achievements/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.achievements.global.title };

export default async function AdminGlobalAchievementsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");
  if (session.adminScope !== "global") notFound();

  const badges = await listManagedGlobalBadges(globalAchievementAdminDeps, {
    uid: session.uid,
    role: session.role,
    adminScope: session.adminScope,
  });
  if (!badges.ok) throw new Error("Could not read global badges");

  return (
    <ScreenEnter>
      <GlobalBadgesAdminView
        badges={badges.value}
        defaultsCount={DEFAULT_GLOBAL_BADGES.length}
        seed={seedGlobalBadgesAction}
        setActive={setGlobalBadgeActiveAction}
        move={moveGlobalBadgeAction}
        remove={deleteGlobalBadgeAction}
        hrefs={{
          create: `${ROUTES.adminGlobalAchievements}/nueva`,
          editBase: ROUTES.adminGlobalAchievements,
          editionList: ROUTES.adminAchievements,
          globalList: ROUTES.adminGlobalAchievements,
        }}
      />
    </ScreenEnter>
  );
}
