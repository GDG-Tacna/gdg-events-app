import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { issuePassAction } from "@/app-shell/pass/issue-pass.action";
import { requireAttendee } from "@/app-shell/guards";
import { PassDisplay } from "@/features/pass";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.pass.title} · ${copy.brand.name}` };

export default async function PassPage() {
  if (!FEATURES.checkins) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home.
  await requireAttendee();

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-space-6 min-[760px]:pt-safe-space-8 min-[760px]:pb-space-8 mx-auto w-full">
        <ScreenEnter>
          <PassDisplay issue={issuePassAction} />
        </ScreenEnter>
      </main>
    </>
  );
}
