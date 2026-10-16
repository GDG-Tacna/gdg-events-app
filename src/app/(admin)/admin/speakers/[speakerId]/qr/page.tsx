import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { speakerAdminDeps } from "@/app-shell/composition/speakers.server";
import { requireRole } from "@/app-shell/guards";
import { requireSection } from "@/app-shell/permissions.server";
import { SpeakerCodeScreen } from "@/app-shell/speakers/SpeakerCodeScreen";
import { listManagedSpeakers } from "@/features/speakers/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.speakers.qr.title };

export default async function AdminSpeakerQrPage({ params }: { params: Promise<{ speakerId: string }> }) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "talks");
  const { speakerId } = await params;

  const speakers = await listManagedSpeakers(speakerAdminDeps, { uid: session.uid, role: session.role });
  if (!speakers.ok) throw new Error("Could not read the speakers");
  // Only an active speaker has a code: anything else is not found.
  const speaker = speakers.value.find((candidate) => candidate.id === speakerId && candidate.active);
  if (!speaker) notFound();

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={ROUTES.adminSpeakers} variant="ghost" size="sm" className="-ml-space-4">
            {copy.admin.speakers.qr.back}
          </ButtonLink>
        </div>
        <SpeakerCodeScreen speakerId={speaker.id} name={speaker.name} />
      </div>
    </ScreenEnter>
  );
}
