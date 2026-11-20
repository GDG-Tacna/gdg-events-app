import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServeScreenBound } from "@/app-shell/ServeScreenBound";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { requireRole } from "@/app-shell/guards";
import { requireSection } from "@/app-shell/permissions.server";
import { getServePoint, listServePoints } from "@/features/checkpoints/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.checkpoints.title };

/** An admin's scanner at one puesto: the same screen and server action staff use, reached from Admin › Puestos. */
export default async function AdminCheckpointScanPage({ params }: PageProps<"/admin/puestos/escanear/[checkpointId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "checkpoints");
  const { checkpointId } = await params;

  // An admin operates every kind of station, so no kind or scope limits apply.
  const actor = { uid: session.uid, role: session.role };
  const point = await getServePoint(serveDeps, actor, checkpointId);
  if (!point.ok) {
    // Unknown, closed or non-station checkpoints are simply not found; a failed read is a real error.
    if (point.error.code === "unknown") throw new Error("Could not read the serving point");
    notFound();
  }
  // The row that switches between the open puestos; the list only decorates, so a failed read just hides the row.
  const open = await listServePoints(serveDeps, actor);

  return (
    <ScreenEnter>
      <ServeScreenBound
        checkpointId={point.value.id}
        kind={point.value.kind}
        name={point.value.name}
        description={point.value.description}
        image={point.value.image}
        initialCount={point.value.servedCount}
        backHref={ROUTES.adminCheckpoints}
        backLabel={copy.admin.checkpoints.scanBack}
        stations={open.ok ? open.value.map(({ id, name }) => ({ id, name })) : undefined}
        stationBase={ROUTES.adminCheckpointScan}
      />
    </ScreenEnter>
  );
}
