import type { Metadata } from "next";
import { quadrantAdminDeps } from "@/app-shell/composition/quadrant-admin.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { saveVenueAction } from "@/app-shell/quadrants/manage.actions";
import { VenueEditor } from "@/features/quadrants";
import { getVenueForEdit } from "@/features/quadrants/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.map.editor.title };

export default async function AdminVenuePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "map");

  const edit = await getVenueForEdit(quadrantAdminDeps, { uid: session.uid, role: session.role });
  if (!edit.ok) throw new Error("Could not read the venue plan");

  return (
    <ScreenEnter>
      <VenueEditor
        upload={uploadImageAction}
        venue={edit.value.venue}
        isDefault={edit.value.isDefault}
        quadrants={edit.value.quadrants}
        save={saveVenueAction}
        hrefs={{ back: ROUTES.adminZones, checkpoints: ROUTES.adminCheckpoints }}
      />
    </ScreenEnter>
  );
}
