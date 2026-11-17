import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { issueQrAction } from "@/app-shell/ephemeral-qr/issue-qr.action";
import { requireRole } from "@/app-shell/guards";
import { staffCheckpoints, staffStations } from "@/app-shell/permissions.server";
import { getServePoint } from "@/features/checkpoints/server";
import { QrDisplay } from "@/features/ephemeral-qr";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.screenQrTitle };

/**
 * An entrance's or a stand's code on a screen (the door, the stand's tablet), for cadets to scan. Staff (and admins)
 * open it; every device that opens it asks the server for its own code, so two screens at the same place do not depend
 * on each other. Staff limited to some stations only reach their own.
 */
export default async function StaffScreenQrPage({ params }: PageProps<"/staff/qr/[checkpointId]">) {
  if (!FEATURES.checkins) notFound();
  const session = await requireRole(["staff"]);
  const { checkpointId } = await params;

  const point = await getServePoint(serveDeps, { uid: session.uid, role: session.role, kinds: session.role === "staff" ? await staffStations() : undefined, checkpointIds: await staffCheckpoints(session) }, checkpointId);
  if (!point.ok) {
    // Unknown, closed or not-allowed stations are simply not found; a failed read is a real error.
    if (point.error.code === "unknown") throw new Error("Could not read the serving point");
    notFound();
  }
  // Only the entrance and the stands have a code that changes on a screen; the catering scans the cadet's pass.
  if (point.value.kind !== "entrance" && point.value.kind !== "stand") notFound();
  const scanHint = point.value.kind === "stand" ? copy.admin.qr.scanHintStand : copy.admin.qr.scanHintEntrance;

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={ROUTES.staff} variant="ghost" size="sm" className="-ml-space-4">
            {copy.staff.entranceQrBack}
          </ButtonLink>
        </div>
        <QrDisplay checkpointId={point.value.id} name={point.value.name} description={point.value.description} image={point.value.image} issue={issueQrAction} texts={{ scanHint, errors: copy.admin.qr.errors }} />
      </div>
    </ScreenEnter>
  );
}
