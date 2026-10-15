import type { Metadata } from "next";
import { odysseyAdminDeps, storyAdminDeps } from "@/app-shell/composition/odyssey.server";
import { requireRole } from "@/app-shell/guards";
import { loadOdysseyFormOptions } from "@/app-shell/odyssey/form-options.server";
import { moveCommunicationAction, saveStoryTitleAction, seedCommunicationsAction, setCommunicationActiveAction } from "@/app-shell/odyssey/manage.actions";
import { CommunicationsAdminView } from "@/features/odyssey";
import { DEFAULT_COMMUNICATIONS, getStoryTitle, listManagedCommunications } from "@/features/odyssey/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.odyssey.title };

export default async function AdminOdysseyPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "odyssey");

  const [communications, options, storyTitle] = await Promise.all([
    listManagedCommunications(odysseyAdminDeps, { uid: session.uid, role: session.role }),
    loadOdysseyFormOptions(),
    // Read past the cache, so the admin sees what was just saved.
    getStoryTitle(storyAdminDeps.titles),
  ]);
  if (!communications.ok) throw new Error("Could not read the communications");

  return (
    <ScreenEnter>
      <CommunicationsAdminView
        communications={communications.value}
        quadrants={options.quadrants}
        missions={options.missions}
        defaultsCount={DEFAULT_COMMUNICATIONS.length}
        seed={seedCommunicationsAction}
        setActive={setCommunicationActiveAction}
        move={moveCommunicationAction}
        storyTitle={storyTitle}
        saveTitle={saveStoryTitleAction}
        hrefs={{ create: `${ROUTES.adminOdyssey}/nueva`, editBase: ROUTES.adminOdyssey }}
      />
    </ScreenEnter>
  );
}
