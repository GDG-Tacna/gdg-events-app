import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { issueQrAction } from "@/app-shell/ephemeral-qr/issue-qr.action";
import { requireRole } from "@/app-shell/guards";
import { staffStations } from "@/app-shell/permissions.server";
import { getServePoint } from "@/features/checkpoints/server";
import { QrDisplay } from "@/features/ephemeral-qr";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.showEntranceQr };

/**
 * The entrance's code on a screen at the door, for cadets to scan. Staff (and admins) open it; every device that opens
 * it asks the server for its own code, so two screens at the same door do not depend on each other.
 */
export default async function StaffEntranceQrPage({ params }: PageProps<"/staff/qr/[checkpointId]">) {
  if (!FEATURES.checkins) notFound();
  const session = await requireRole(["staff"]);
  const { checkpointId } = await params;

  const point = await getServePoint(serveDeps, { uid: session.uid, role: session.role, kinds: session.role === "staff" ? await staffStations() : undefined }, checkpointId);
  if (!point.ok) {
    // Unknown, closed or not-allowed stations are simply not found; a failed read is a real error.
    if (point.error.code === "unknown") throw new Error("Could not read the serving point");
    notFound();
  }
  // Only the entrance has a code that changes on a screen.
  if (point.value.kind !== "entrance") notFound();

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={ROUTES.staff} variant="ghost" size="sm" className="-ml-space-4">
            {copy.staff.entranceQrBack}
          </ButtonLink>
        </div>
        <QrDisplay checkpointId={point.value.id} name={point.value.name} issue={issueQrAction} texts={{ scanHint: copy.admin.qr.scanHintEntrance, errors: copy.admin.qr.errors }} />
      </div>
    </ScreenEnter>
  );
}
