import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { odysseyDeps, storyTitleSource } from "@/app-shell/composition/odyssey.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { requireAttendee } from "@/app-shell/guards";
import { OdysseyView } from "@/features/odyssey";
import { getOdyssey, getStoryTitle } from "@/features/odyssey/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";

export const metadata: Metadata = { title: `${copy.odyssey.title} · ${copy.brand.name}` };

export default async function OdysseyPage() {
  if (!(await moduleOn("odyssey"))) notFound();
  const session = await requireAttendee();

  const [log, galaxy, title] = await Promise.all([getOdyssey(odysseyDeps, session.uid), getGalaxyMap(galaxyDeps), getStoryTitle(storyTitleSource)]);
  if (!log.ok) throw new Error("Could not read the odyssey");
  // Quadrant names and planets only decorate the log: without them the transmissions are still listed.
  const quadrants = galaxy.ok ? galaxy.value.quadrants.map(({ id, name, planet }) => ({ id, name, planet })) : [];

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe px-space-4 py-space-6 min-[760px]:py-space-8 mx-auto w-full max-w-[520px] min-[760px]:max-w-[720px]">
        <ScreenEnter>
          <OdysseyView title={title} log={log.value} quadrants={quadrants} backHref={ROUTES.missions} />
        </ScreenEnter>
      </main>
    </>
  );
}
