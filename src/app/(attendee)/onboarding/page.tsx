import type { Metadata } from "next";
import { requireOnboardingPending } from "@/app-shell/guards";
import { registerAttendeeAction } from "@/app-shell/onboarding/register-attendee.action";
import { OnboardingForm } from "@/features/attendee";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = {
  title: `${copy.onboarding.title} · ${copy.brand.name}`,
};

export default async function OnboardingPage() {
  // Visitors go to /login; users who already have a role go to the dashboard.
  await requireOnboardingPending();

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe pb-safe px-space-4 py-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          {/* New attendees meet their squad next; with the optional feature off they go straight to the dashboard. */}
          <OnboardingForm
            register={registerAttendeeAction}
            nextPath={(await moduleOn("squads")) ? ROUTES.squad : ROUTES.dashboard}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
