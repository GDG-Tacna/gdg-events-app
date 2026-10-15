import type { Metadata } from "next";
import { editionsDeps, moduleDeps, permissionDeps } from "@/app-shell/composition/event.server";
import { copyEditionAction, createEditionAction, publishEditionAction, setEditionModulesAction, setEditionPermissionsAction, setEditionStatusAction, updateEditionAction } from "@/app-shell/event/editions.actions";
import { requireRole } from "@/app-shell/guards";
import { EventsAdminView } from "@/features/event";
import { getEditionPermissions, listEditions, listOffModules, runInEdition } from "@/features/event/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.events.title };

export default async function AdminEventsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "event");

  const scope = session.adminScope ?? "edition";
  const editions = await listEditions(editionsDeps, { uid: session.uid, role: session.role, adminScope: scope, editionId: session.workingEdition });
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!editions.ok) throw new Error("Could not read the editions");
  const global = scope === "global";
  // Each edition's modules and permissions, read inside that edition (editions are few).
  const settings = global
    ? await Promise.all(
        editions.value.map(async (edition) => {
          const [off, allowed] = await runInEdition(edition.id, () => Promise.all([listOffModules(moduleDeps), getEditionPermissions(permissionDeps)]));
          if (!off.ok || !allowed.ok) throw new Error("Could not read the edition's settings");
          return { id: edition.id, off: off.value, permissions: allowed.value };
        }),
      )
    : undefined;
  const modules = settings ? Object.fromEntries(settings.map((entry) => [entry.id, entry.off])) : undefined;
  const permissions = settings ? Object.fromEntries(settings.map((entry) => [entry.id, entry.permissions])) : undefined;

  return (
    <ScreenEnter>
      <EventsAdminView
        editions={editions.value.map((edition) => ({
          ...edition,
          startsAt: edition.startsAt?.toISOString() ?? null,
          endsAt: edition.endsAt?.toISOString() ?? null,
        }))}
        now={editionsDeps.now().toISOString()}
        canManage={global}
        create={createEditionAction}
        update={updateEditionAction}
        setStatus={setEditionStatusAction}
        publish={publishEditionAction}
        copyContent={global ? copyEditionAction : undefined}
        modules={modules}
        saveModules={global ? setEditionModulesAction : undefined}
        permissions={permissions}
        savePermissions={global ? setEditionPermissionsAction : undefined}
      />
    </ScreenEnter>
  );
}
