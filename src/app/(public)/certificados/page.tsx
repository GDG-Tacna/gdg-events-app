import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendeeShell } from "@/app-shell/AttendeeShell";
import { claimCertificateAction } from "@/app-shell/certificates/user.actions";
import { readUserCertificates } from "@/app-shell/composition/certificates.server";
import { isPublicEventFinished } from "@/app-shell/event-status.server";
import { requireSession } from "@/app-shell/guards";
import { SignOutButton } from "@/features/auth";
import { MyCertificatesView } from "@/features/certificates";
import { getServerEnv } from "@/shared/config/env.server";
import { FEATURES } from "@/shared/config/features";
import { homeFor } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { BrandMark, ButtonLink, ScreenEnter, SpaceBackground, ThemeToggle } from "@/shared/ui";

export const metadata: Metadata = {
  title: `${copy.certificates.title} · ${copy.brand.name}`,
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * Signed-in user's certificates portal across every edition (past and current).
 * Uses `requireSession()` (not `requireAttendee()`), so attendees, speakers, staff, admins
 * and alumni from previous editions can all view and claim their certificates directly.
 */
export default async function CertificatesPage() {
  if (!FEATURES.certificates) notFound();
  const session = await requireSession();
  const [overview, finished] = await Promise.all([
    readUserCertificates({
      uid: session.uid,
      email: session.verifiedEmail ?? null,
      displayName: session.displayName,
    }),
    isPublicEventFinished(),
  ]);
  if (!overview.ok) throw new Error("Could not load user certificates");

  const env = getServerEnv();
  const backHref = homeFor(session.role);
  const content = (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-space-6 pb-safe-space-8 mx-auto w-full max-w-[760px]">
        <ScreenEnter>
          <MyCertificatesView
            claimable={overview.value.claimable}
            issued={overview.value.issued}
            baseUrl={env.appUrl ?? ""}
            claim={claimCertificateAction}
          />
        </ScreenEnter>
      </main>
    </>
  );

  if (finished && session.role === "attendee") {
    return <AttendeeShell>{content}</AttendeeShell>;
  }

  return (
    <>
      <SpaceBackground />
      <header className="bg-surface border-border pt-safe sticky top-0 z-30 border-b">
        <div className="px-space-4 py-space-2 gap-space-3 mx-auto flex w-full max-w-[760px] items-center justify-between">
          <BrandMark compact />
          <div className="gap-space-2 flex shrink-0 items-center">
            <ButtonLink href={backHref} variant="ghost" size="sm">
              {copy.certificates.back}
            </ButtonLink>
            <ThemeToggle />
            <SignOutButton variant="icon" />
          </div>
        </div>
      </header>
      <main className="px-space-4 pt-space-6 pb-safe-space-8 mx-auto w-full max-w-[760px]">
        <ScreenEnter>
          <MyCertificatesView
            claimable={overview.value.claimable}
            issued={overview.value.issued}
            baseUrl={env.appUrl ?? ""}
            claim={claimCertificateAction}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
