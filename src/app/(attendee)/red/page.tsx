import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { networkDeps } from "@/app-shell/composition/network.server";
import { requireAttendee } from "@/app-shell/guards";
import { NetworkScreen } from "@/app-shell/NetworkScreen";
import { getNetwork } from "@/features/network/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { isPublicEventFinished } from "@/app-shell/event-status.server";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.network.title} · ${copy.brand.name}` };

export default async function NetworkPage() {
  if (!(await moduleOn("network"))) notFound();
  // Visitors go to /login, users without a role go to onboarding, staff and admin go to their own home.
  const session = await requireAttendee();

  const network = await getNetwork(networkDeps, { uid: session.uid, role: session.role });
  if (!network.ok) {
    // An attendee role without a profile in this edition registers again, as on the dashboard.
    if (network.error.code === "not-registered") redirect(ROUTES.onboarding);
    throw new Error("Could not read the cadet network");
  }
  const { me, contacts, reward } = network.value;
  const [achievementsOn, finished] = await Promise.all([moduleOn("achievements"), isPublicEventFinished()]);

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-space-4 pb-space-6 min-[760px]:pt-space-4 min-[760px]:pb-space-8 mx-auto w-full">
        <ScreenEnter>
          <NetworkScreen
            me={me}
            // Plain data for the client: who, never when (the order already says it).
            contacts={contacts.map(({ id, alias, squad, links }) => ({ id, alias, squad, links }))}
            reward={reward}
            achievementsHref={achievementsOn ? ROUTES.achievements : undefined}
            readOnly={finished}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
