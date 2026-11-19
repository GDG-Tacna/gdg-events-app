import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { issuePassAction } from "@/app-shell/pass/issue-pass.action";
import { requireAttendee } from "@/app-shell/guards";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import { PassDisplay } from "@/features/pass";
import { getAttendee } from "@/features/attendee/server";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.pass.title} · ${copy.brand.name}` };

export default async function PassPage() {
  if (!FEATURES.checkins) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home.
  const session = await requireAttendee();
  // The ticket only decorates the pass: when it cannot be read the pass still shows.
  const attendee = await getAttendee(attendeeDeps, session.uid);

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-space-4 pb-space-6 min-[760px]:pt-space-4 min-[760px]:pb-space-8 mx-auto w-full">
        <ScreenEnter>
          <PassDisplay issue={issuePassAction} ticket={attendee.ok ? (attendee.value?.ticket.type ?? null) : null} />
        </ScreenEnter>
      </main>
    </>
  );
}
