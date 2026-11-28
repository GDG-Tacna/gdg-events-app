import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAttendeeAchievementsOverview } from "@/app-shell/composition/achievements.server";
import { getPublicEventState } from "@/app-shell/event-status.server";
import { requireAttendee, requireSession } from "@/app-shell/guards";
import { AchievementsView } from "@/features/achievements";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.achievements.title} · ${copy.brand.name}` };

export default async function AchievementsPage() {
  if (!(await moduleOn("achievements"))) notFound();
  const eventState = await getPublicEventState();
  // Once an edition finishes, any signed-in user (including alumni or unregistered post-event visitors)
  // can view their global community badges and past-edition achievements without being forced into onboarding.
  const session = eventState.finished ? await requireSession() : await requireAttendee();

  const overview = await getAttendeeAchievementsOverview(session.uid, {
    activeEventId: eventState.id,
    activeEventName: eventState.name,
    activeEventFinished: eventState.finished,
    includeLiveActive: !eventState.finished,
  });
  if (!overview.ok) throw new Error("Could not read the achievements");

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-space-4 pb-space-6 min-[760px]:pt-space-4 min-[760px]:pb-space-8 mx-auto w-full max-w-[520px] min-[760px]:max-w-[720px]">
        <ScreenEnter>
          <AchievementsView globalBadges={overview.value.globalBadges} editions={overview.value.editions} />
        </ScreenEnter>
      </main>
    </>
  );
}
