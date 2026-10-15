import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServeScreenBound } from "@/app-shell/ServeScreenBound";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { staffStations } from "@/app-shell/permissions.server";
import { requireRole } from "@/app-shell/guards";
import { getServePoint } from "@/features/checkpoints/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.title };

export default async function StaffServePage({ params }: PageProps<"/staff/serve/[checkpointId]">) {
  const session = await requireRole(["staff"]);
  const { checkpointId } = await params;

  const point = await getServePoint(serveDeps, { uid: session.uid, role: session.role, kinds: session.role === "staff" ? await staffStations() : undefined }, checkpointId);
  if (!point.ok) {
    // Unknown, closed or non-station checkpoints are simply not found; a failed read is a real error.
    if (point.error.code === "unknown") throw new Error("Could not read the serving point");
    notFound();
  }

  return (
    <ScreenEnter>
      <ServeScreenBound checkpointId={point.value.id} kind={point.value.kind} name={point.value.name} initialCount={point.value.servedCount} />
    </ScreenEnter>
  );
}
