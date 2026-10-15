import type { Metadata } from "next";
import { eventDeps } from "@/app-shell/composition/event.server";
import { squadAdminDeps } from "@/app-shell/composition/squad-admin.server";
import { requireRole } from "@/app-shell/guards";
import {
  moveSquadAction,
  reactivateSquadAction,
  retireSquadAction,
  seedSquadsAction,
} from "@/app-shell/squads/manage.actions";
import { hasEventFinished } from "@/features/event/server";
import { SquadsAdminView } from "@/features/squads";
import { listManagedSquads } from "@/features/squads/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.squads.title };

export default async function AdminSquadsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "squads");

  const [squads, finished] = await Promise.all([
    listManagedSquads(squadAdminDeps, { uid: session.uid, role: session.role }),
    hasEventFinished(eventDeps),
  ]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!squads.ok) throw new Error("Could not read the squads");

  return (
    <ScreenEnter>
      <SquadsAdminView
        squads={squads.value}
        // When the end cannot be read, retiring stays locked: the server would refuse it anyway.
        eventFinished={finished.ok && finished.value}
        seed={seedSquadsAction}
        retire={retireSquadAction}
        reactivate={reactivateSquadAction}
        move={moveSquadAction}
        hrefs={{
          create: `${ROUTES.adminSquads}/nuevo`,
          editBase: ROUTES.adminSquads,
          event: ROUTES.adminEvent,
        }}
      />
    </ScreenEnter>
  );
}
