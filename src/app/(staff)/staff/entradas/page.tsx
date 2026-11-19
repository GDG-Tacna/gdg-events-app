import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChangeTicketScreenBound } from "@/app-shell/ChangeTicketScreenBound";
import { requireRole } from "@/app-shell/guards";
import { staffCheckpoints, staffStations } from "@/app-shell/permissions.server";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.staff.tickets.title };

/**
 * «Cambiar entrada»: the staff scan a cadet's pass and set their ticket, for example when they buy it on the day.
 * Staff (and admins) open it; staff limited to no station have nothing to do here, like at the serving screens.
 */
export default async function StaffTicketsPage() {
  if (!FEATURES.checkins) notFound();
  const session = await requireRole(["staff"]);
  if (session.role === "staff") {
    const [kinds, stations] = await Promise.all([staffStations(), staffCheckpoints(session)]);
    if (kinds.length === 0 || (stations !== undefined && stations.length === 0)) notFound();
  }

  return (
    <ScreenEnter>
      <ChangeTicketScreenBound />
    </ScreenEnter>
  );
}
