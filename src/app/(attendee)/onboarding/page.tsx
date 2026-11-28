import type { Metadata } from "next";
import Link from "next/link";
import { readUserCertificates } from "@/app-shell/composition/certificates.server";
import { getPublicEventState } from "@/app-shell/event-status.server";
import { requireOnboardingPending } from "@/app-shell/guards";
import { registerAttendeeAction } from "@/app-shell/onboarding/register-attendee.action";
import { OnboardingForm } from "@/features/attendee";
import { SignOutButton } from "@/features/auth";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon, ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = {
  title: `${copy.onboarding.title} · ${copy.brand.name}`,
};

export default async function OnboardingPage() {
  // Visitors go to /login; users who already have a role go to the dashboard.
  const session = await requireOnboardingPending();
  const [eventState, squadsOn, achievementsOn, certs] = await Promise.all([
    getPublicEventState(),
    moduleOn("squads"),
    moduleOn("achievements"),
    FEATURES.certificates ? readUserCertificates({ uid: session.uid, email: session.verifiedEmail ?? null, displayName: session.displayName }) : null,
  ]);
  const hasCertificates = Boolean(certs?.ok && (certs.value.claimable.length > 0 || certs.value.issued.length > 0));

  if (eventState.finished) {
    const f = copy.onboarding.finished;
    const title = eventState.name ? interpolate(f.titleNamed, { name: eventState.name }) : f.titleFallback;
    return (
      <>
        <SpaceBackground />
        <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 gap-space-4 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
          <ScreenEnter>
            <Card className="gap-space-4 flex flex-col">
              <div className="gap-space-2 flex items-center">
                <span className="bg-primary text-primary-foreground border-ink grid size-9 shrink-0 place-items-center rounded-full border-2">
                  <Icon name="verified" size={20} />
                </span>
                <p className="type-caption text-cyan-ink font-semibold uppercase tracking-wider">{f.badge}</p>
              </div>
              <h1 className="type-title-xl text-foreground">{title}</h1>
              <p className="type-body text-muted-foreground">{f.body}</p>
              <div className="gap-space-2 flex flex-col">
                {FEATURES.certificates ? (
                  <ButtonLink href={ROUTES.certificates} variant={hasCertificates ? "primary" : "secondary"} block>
                    <Icon name="certificate" size={20} />
                    {f.certificates}
                  </ButtonLink>
                ) : null}
                {achievementsOn ? (
                  <ButtonLink href={ROUTES.achievements} variant="secondary" block>
                    <Icon name="trophy" size={20} />
                    {f.achievements}
                  </ButtonLink>
                ) : null}
              </div>
              <div className="pt-space-2 flex justify-center">
                <SignOutButton />
              </div>
            </Card>
          </ScreenEnter>
        </main>
      </>
    );
  }

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 gap-space-4 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          {/* New attendees meet their squad next; with the optional feature off they go straight to the dashboard. */}
          <OnboardingForm
            register={registerAttendeeAction}
            nextPath={squadsOn ? ROUTES.squad : ROUTES.dashboard}
          />
          {hasCertificates ? (
            <p className="mt-space-4 text-center">
              <Link href={ROUTES.certificates} className="type-body-sm text-cyan-ink underline underline-offset-4">
                {copy.certificates.onboardingLink}
              </Link>
            </p>
          ) : null}
        </ScreenEnter>
      </main>
    </>
  );
}
