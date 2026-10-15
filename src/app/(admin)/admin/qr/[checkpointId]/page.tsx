import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { issueQrAction } from "@/app-shell/ephemeral-qr/issue-qr.action";
import { requireRole } from "@/app-shell/guards";
import { QrDisplay } from "@/features/ephemeral-qr";
import { listTalks } from "@/features/ephemeral-qr/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.qr.title };

export default async function AdminQrDisplayPage({ params }: PageProps<"/admin/qr/[checkpointId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, ["checkpoints", "talks"]);
  const { checkpointId } = await params;

  const talks = await listTalks(ephemeralQrDeps, { uid: session.uid, role: session.role });
  if (!talks.ok) throw new Error("Could not read the talks");
  // Only an active talk can be projected: anything else (unknown id, catering, closed) is not found.
  const talk = talks.value.find((candidate) => candidate.id === checkpointId);
  if (!talk) notFound();

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={`${ROUTES.adminTalks}/${talk.id}`} variant="ghost" size="sm" className="-ml-space-4">
            {copy.admin.qr.back}
          </ButtonLink>
        </div>
        <QrDisplay checkpointId={talk.id} name={talk.name} issue={issueQrAction} />
      </div>
    </ScreenEnter>
  );
}
