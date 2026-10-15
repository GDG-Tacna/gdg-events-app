import type { Metadata } from "next";
import { requireRole } from "@/app-shell/guards";
import { createQuadrantAction } from "@/app-shell/quadrants/manage.actions";
import { QuadrantForm } from "@/features/quadrants";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.map.quadrantForm.createTitle };

export default async function AdminNewQuadrantPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "map");

  return (
    <ScreenEnter>
      <QuadrantForm mode="create" save={createQuadrantAction} listHref={ROUTES.adminMap} />
    </ScreenEnter>
  );
}
