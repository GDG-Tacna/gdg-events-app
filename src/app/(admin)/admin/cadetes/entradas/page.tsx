import type { Metadata } from "next";
import { ticketDeps } from "@/app-shell/composition/tickets.server";
import { requireRole } from "@/app-shell/guards";
import { mayEdit, requireSection } from "@/app-shell/permissions.server";
import { importTicketHoldersAction } from "@/app-shell/tickets/tickets.actions";
import { ImportTicketsView } from "@/features/tickets";
import { summarizeTicketHolders } from "@/features/tickets/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.cadets.tickets.title };

export default async function AdminCadetTicketsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "cadets");

  const [summary, canEdit] = await Promise.all([summarizeTicketHolders(ticketDeps, { uid: session.uid, role: session.role }), mayEdit(session, "cadets")]);

  return (
    <ScreenEnter>
      {/* A list that cannot be read shows as not loaded: importing again is still possible. */}
      <ImportTicketsView summary={summary.ok ? summary.value : null} importHolders={importTicketHoldersAction} canEdit={canEdit} backHref={ROUTES.adminCadets} />
    </ScreenEnter>
  );
}
