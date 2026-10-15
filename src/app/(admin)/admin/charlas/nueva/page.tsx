import type { Metadata } from "next";
import { talkRooms } from "@/app-shell/composition/talks.server";
import { requireRole } from "@/app-shell/guards";
import { createTalkAction } from "@/app-shell/talks/manage.actions";
import { TalkForm } from "@/features/talks";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.talks.form.createTitle };

export default async function AdminNewTalkPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "talks");
  const rooms = await talkRooms();

  return (
    <ScreenEnter>
      <TalkForm mode="create" save={createTalkAction} rooms={rooms} listHref={ROUTES.adminTalks} />
    </ScreenEnter>
  );
}
