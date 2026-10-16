import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { achievementDeps } from "@/app-shell/composition/achievements.server";
import { requireAttendee } from "@/app-shell/guards";
import { AchievementsView } from "@/features/achievements";
import { syncAchievements } from "@/features/achievements/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.achievements.title} · ${copy.brand.name}` };

export default async function AchievementsPage() {
  if (!(await moduleOn("achievements"))) notFound();
  const session = await requireAttendee();

  // Opening the tab also awards anything a scan or an answer could not award at the time.
  const achievements = await syncAchievements(achievementDeps, session.uid);
  if (!achievements.ok) throw new Error("Could not read the achievements");

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-space-6 min-[760px]:pt-safe-space-8 min-[760px]:pb-space-8 mx-auto w-full max-w-[520px] min-[760px]:max-w-[720px]">
        <ScreenEnter>
          <AchievementsView badges={achievements.value.badges} />
        </ScreenEnter>
      </main>
    </>
  );
}
