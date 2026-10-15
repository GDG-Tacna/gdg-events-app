import type { Metadata } from "next";
import { talkAdminDeps, talkRooms } from "@/app-shell/composition/talks.server";
import { requireRole } from "@/app-shell/guards";
import { setTalkActiveAction } from "@/app-shell/talks/manage.actions";
import { toTalkView } from "@/app-shell/talks/talk-view.server";
import { TalksAdminView } from "@/features/talks";
import { listManagedTalks } from "@/features/talks/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.talks.title };

export default async function AdminTalksPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "talks");

  const [talks, rooms] = await Promise.all([listManagedTalks(talkAdminDeps, { uid: session.uid, role: session.role }), talkRooms()]);
  // A failed read goes to the route error boundary instead of showing an empty agenda that is not real.
  if (!talks.ok) throw new Error("Could not read the talks");

  return (
    <ScreenEnter>
      <TalksAdminView
        talks={talks.value.map(toTalkView)}
        rooms={rooms}
        setActive={setTalkActiveAction}
        hrefs={{ create: `${ROUTES.adminTalks}/nueva`, editBase: ROUTES.adminTalks, projectBase: ROUTES.adminQr }}
      />
    </ScreenEnter>
  );
}
