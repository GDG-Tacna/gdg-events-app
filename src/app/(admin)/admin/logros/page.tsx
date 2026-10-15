import type { Metadata } from "next";
import { loadAchievementFormOptions, ruleNamesOf } from "@/app-shell/achievements/form-options.server";
import { moveBadgeAction, seedBadgesAction, setBadgeActiveAction } from "@/app-shell/achievements/manage.actions";
import { achievementAdminDeps } from "@/app-shell/composition/achievements.server";
import { requireRole } from "@/app-shell/guards";
import { BadgesAdminView } from "@/features/achievements";
import { DEFAULT_BADGES, listManagedBadges } from "@/features/achievements/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.achievements.title };

export default async function AdminAchievementsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "achievements");

  const [badges, options] = await Promise.all([listManagedBadges(achievementAdminDeps, { uid: session.uid, role: session.role }), loadAchievementFormOptions()]);
  if (!badges.ok) throw new Error("Could not read the badges");

  return (
    <ScreenEnter>
      <BadgesAdminView
        badges={badges.value}
        names={ruleNamesOf(options)}
        defaultsCount={DEFAULT_BADGES.length}
        seed={seedBadgesAction}
        setActive={setBadgeActiveAction}
        move={moveBadgeAction}
        hrefs={{ create: `${ROUTES.adminAchievements}/nueva`, editBase: ROUTES.adminAchievements }}
      />
    </ScreenEnter>
  );
}
