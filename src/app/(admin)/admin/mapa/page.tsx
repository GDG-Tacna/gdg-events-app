import type { Metadata } from "next";
import { quadrantAdminDeps } from "@/app-shell/composition/quadrant-admin.server";
import { requireRole } from "@/app-shell/guards";
import { moveQuadrantAction, seedLayoutAction, setQuadrantActiveAction } from "@/app-shell/quadrants/manage.actions";
import { QuadrantsAdminView } from "@/features/quadrants";
import { DEFAULT_QUADRANTS, listManagedQuadrants } from "@/features/quadrants/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.map.title };

export default async function AdminMapPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "map");

  const quadrants = await listManagedQuadrants(quadrantAdminDeps, { uid: session.uid, role: session.role });
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!quadrants.ok) throw new Error("Could not read the quadrants");

  return (
    <ScreenEnter>
      <QuadrantsAdminView
        quadrants={quadrants.value}
        defaultsCount={DEFAULT_QUADRANTS.length}
        seed={seedLayoutAction}
        setActive={setQuadrantActiveAction}
        move={moveQuadrantAction}
        hrefs={{ create: `${ROUTES.adminMap}/cuadrantes/nuevo`, editBase: `${ROUTES.adminMap}/cuadrantes`, plan: `${ROUTES.adminMap}/plano` }}
      />
    </ScreenEnter>
  );
}
