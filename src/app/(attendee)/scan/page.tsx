import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScannerScreen } from "@/app-shell/ScannerScreen";
import { requireAttendee } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.scanner.title} · ${copy.brand.name}` };

export default async function ScanPage() {
  if (!FEATURES.checkins) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home: only attendees scan.
  await requireAttendee();
  const [achievementsOn, networkOn] = await Promise.all([moduleOn("achievements"), moduleOn("network")]);

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe px-space-4 py-space-6 min-[760px]:py-space-8 mx-auto w-full">
        <ScreenEnter>
          <ScannerScreen achievementsOn={achievementsOn} networkOn={networkOn} />
        </ScreenEnter>
      </main>
    </>
  );
}
