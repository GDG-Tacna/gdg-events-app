import type { Metadata } from "next";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { createSquadAction } from "@/app-shell/squads/manage.actions";
import { SquadForm } from "@/features/squads";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.squads.form.newTitle };

export default async function AdminNewSquadPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "squads");

  return (
    <ScreenEnter>
      <SquadForm
        upload={uploadImageAction} mode="create" save={createSquadAction} listHref={ROUTES.adminSquads} />
    </ScreenEnter>
  );
}
