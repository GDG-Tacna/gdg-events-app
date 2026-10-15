import type { Metadata } from "next";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { missionAdminDeps } from "@/app-shell/composition/mission-admin.server";
import { requireRole } from "@/app-shell/guards";
import { moveMissionAction, seedMissionsAction, setMissionActiveAction } from "@/app-shell/missions/manage.actions";
import { MissionsAdminView } from "@/features/missions";
import { DEFAULT_MISSIONS, listManagedMissions } from "@/features/missions/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.missions.title };

export default async function AdminMissionsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "missions");

  const [missions, galaxy] = await Promise.all([
    listManagedMissions(missionAdminDeps, { uid: session.uid, role: session.role }),
    getGalaxyMap(galaxyDeps),
  ]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!missions.ok) throw new Error("Could not read the missions");
  // Quadrant names only label the rows: without them each row says "Cuadrante inactivo".
  const quadrants = galaxy.ok ? galaxy.value.quadrants.map(({ id, name }) => ({ id, name })) : [];

  return (
    <ScreenEnter>
      <MissionsAdminView
        missions={missions.value}
        quadrants={quadrants}
        defaultsCount={DEFAULT_MISSIONS.length}
        seed={seedMissionsAction}
        setActive={setMissionActiveAction}
        move={moveMissionAction}
        hrefs={{
          create: `${ROUTES.adminMissions}/nueva`,
          editBase: ROUTES.adminMissions,
          ...(FEATURES.missionSuggestions ? { suggest: `${ROUTES.adminMissions}/sugerir` } : {}),
        }}
      />
    </ScreenEnter>
  );
}
