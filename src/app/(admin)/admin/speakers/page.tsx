import type { Metadata } from "next";
import {
  speakerAccessDeps,
  speakerAdminDeps,
} from "@/app-shell/composition/speakers.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { requireSection } from "@/app-shell/permissions.server";
import {
  inviteSpeakerAction,
  unlinkSpeakerAction,
} from "@/app-shell/speakers/access.actions";
import {
  createSpeakerAction,
  setSpeakerActiveAction,
  updateSpeakerAction,
} from "@/app-shell/speakers/manage.actions";
import { SpeakersAdminView } from "@/features/speakers";
import {
  listManagedSpeakers,
  listSpeakerAccess,
} from "@/features/speakers/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.speakers.title };

export default async function AdminSpeakersPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "talks");

  const actor = { uid: session.uid, role: session.role };
  const [speakers, access] = await Promise.all([
    listManagedSpeakers(speakerAdminDeps, actor),
    listSpeakerAccess(speakerAccessDeps, actor),
  ]);
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!speakers.ok || !access.ok)
    throw new Error("Could not read the speakers");

  return (
    <ScreenEnter>
      <SpeakersAdminView
        speakers={speakers.value}
        create={createSpeakerAction}
        update={updateSpeakerAction}
        setActive={setSpeakerActiveAction}
        upload={uploadImageAction}
        qrBase={ROUTES.adminSpeakers}
        access={{
          states: access.value,
          invite: inviteSpeakerAction,
          unlink: unlinkSpeakerAction,
        }}
      />
    </ScreenEnter>
  );
}
