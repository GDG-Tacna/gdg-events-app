import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { quadrantAdminDeps } from "@/app-shell/composition/quadrant-admin.server";
import { requireRole } from "@/app-shell/guards";
import { updateQuadrantAction } from "@/app-shell/quadrants/manage.actions";
import { QuadrantForm } from "@/features/quadrants";
import { listManagedQuadrants } from "@/features/quadrants/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.map.quadrantForm.editTitle };

export default async function AdminEditQuadrantPage({ params }: { params: Promise<{ quadrantId: string }> }) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "map");
  const { quadrantId } = await params;

  const quadrants = await listManagedQuadrants(quadrantAdminDeps, { uid: session.uid, role: session.role });
  if (!quadrants.ok) throw new Error("Could not read the quadrants");
  const quadrant = quadrants.value.find((candidate) => candidate.id === quadrantId);
  if (!quadrant) notFound();

  return (
    <ScreenEnter>
      <QuadrantForm mode="edit" quadrant={quadrant} save={updateQuadrantAction} listHref={ROUTES.adminZones} />
    </ScreenEnter>
  );
}
