import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { squadAdminDeps } from "@/app-shell/composition/squad-admin.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { updateSquadAction } from "@/app-shell/squads/manage.actions";
import { SquadForm } from "@/features/squads";
import { listManagedSquads } from "@/features/squads/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.squads.form.editTitle };

export default async function AdminEditSquadPage({ params }: PageProps<"/admin/escuadrones/[squadId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "squads");
  const { squadId } = await params;

  const squads = await listManagedSquads(squadAdminDeps, { uid: session.uid, role: session.role });
  if (!squads.ok) throw new Error("Could not read the squads");
  const squad = squads.value.find((candidate) => candidate.id === squadId);
  if (!squad) notFound();

  return (
    <ScreenEnter>
      <SquadForm
        upload={uploadImageAction}
        mode="edit"
        save={updateSquadAction}
        listHref={ROUTES.adminSquads}
        squad={{ id: squad.id, name: squad.name, tagline: squad.tagline, sprite: squad.sprite, logo: squad.logo ?? null }}
      />
    </ScreenEnter>
  );
}
