import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { odysseyAdminDeps } from "@/app-shell/composition/odyssey.server";
import { requireRole } from "@/app-shell/guards";
import { loadOdysseyFormOptions } from "@/app-shell/odyssey/form-options.server";
import { updateCommunicationAction } from "@/app-shell/odyssey/manage.actions";
import { CommunicationForm } from "@/features/odyssey";
import { listManagedCommunications } from "@/features/odyssey/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.odyssey.form.editTitle };

export default async function AdminEditCommunicationPage({ params }: PageProps<"/admin/odisea/[communicationId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "odyssey");
  const { communicationId } = await params;

  const [communications, options] = await Promise.all([
    listManagedCommunications(odysseyAdminDeps, { uid: session.uid, role: session.role }),
    loadOdysseyFormOptions(),
  ]);
  if (!communications.ok) throw new Error("Could not read the communications");
  const communication = communications.value.find((candidate) => candidate.id === communicationId);
  if (!communication) notFound();

  return (
    <ScreenEnter>
      <CommunicationForm
        mode="edit"
        communication={communication}
        save={updateCommunicationAction}
        quadrants={options.quadrants}
        missions={options.missions}
        listHref={ROUTES.adminOdyssey}
      />
    </ScreenEnter>
  );
}
