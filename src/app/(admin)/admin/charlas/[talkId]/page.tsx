import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { talkAdminDeps, talkRooms, talkSpeakers } from "@/app-shell/composition/talks.server";
import { requireRole } from "@/app-shell/guards";
import { updateTalkAction } from "@/app-shell/talks/manage.actions";
import { toTalkView } from "@/app-shell/talks/talk-view.server";
import { TalkForm } from "@/features/talks";
import { listManagedTalks } from "@/features/talks/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.talks.form.editTitle };

export default async function AdminEditTalkPage({ params }: PageProps<"/admin/charlas/[talkId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "talks");
  const { talkId } = await params;

  const [talks, rooms, speakers] = await Promise.all([listManagedTalks(talkAdminDeps, { uid: session.uid, role: session.role }), talkRooms(), talkSpeakers()]);
  if (!talks.ok) throw new Error("Could not read the talks");
  const talk = talks.value.find((candidate) => candidate.id === talkId);
  if (!talk) notFound();

  return (
    <ScreenEnter>
      <TalkForm
        mode="edit"
        talk={toTalkView(talk, new Map(speakers.map((speaker) => [speaker.id, speaker.name])))}
        save={updateTalkAction}
        rooms={rooms}
        speakers={speakers}
        speakersHref={ROUTES.adminSpeakers}
        listHref={ROUTES.adminTalks}
        // A closed talk has no code to project.
        qrHref={talk.active ? `${ROUTES.adminQr}/${talk.id}` : undefined}
      />
    </ScreenEnter>
  );
}
