import type { Metadata } from "next";
import { requireRole } from "@/app-shell/guards";
import { loadOdysseyFormOptions } from "@/app-shell/odyssey/form-options.server";
import { createCommunicationAction } from "@/app-shell/odyssey/manage.actions";
import { CommunicationForm } from "@/features/odyssey";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.odyssey.form.createTitle };

export default async function AdminNewCommunicationPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "odyssey");
  const options = await loadOdysseyFormOptions();

  return (
    <ScreenEnter>
      <CommunicationForm mode="create" save={createCommunicationAction} quadrants={options.quadrants} missions={options.missions} listHref={ROUTES.adminOdyssey} />
    </ScreenEnter>
  );
}
