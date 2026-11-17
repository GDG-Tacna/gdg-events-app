import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { issueQrAction } from "@/app-shell/ephemeral-qr/issue-qr.action";
import { requireRole } from "@/app-shell/guards";
import { QrDisplay } from "@/features/ephemeral-qr";
import { listScreenCheckpoints } from "@/features/ephemeral-qr/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.qr.title };

export default async function AdminQrDisplayPage({ params }: PageProps<"/admin/qr/[checkpointId]">) {
  const session = await requireRole(["admin"]);
  await requireSection(session, ["checkpoints", "talks"]);
  const { checkpointId } = await params;

  const shown = await listScreenCheckpoints(ephemeralQrDeps, { uid: session.uid, role: session.role });
  if (!shown.ok) throw new Error("Could not read the checkpoints");
  // Only an open talk or entrance can show a code: anything else (unknown id, catering, closed) is not found.
  const point = shown.value.find((candidate) => candidate.id === checkpointId);
  if (!point) notFound();
  const entrance = point.kind === "entrance";

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={entrance ? ROUTES.adminCheckpoints : ROUTES.adminTalks} variant="ghost" size="sm" className="-ml-space-4">
            {entrance ? copy.admin.qr.backEntrance : copy.admin.qr.back}
          </ButtonLink>
        </div>
        <QrDisplay checkpointId={point.id} name={point.name} issue={issueQrAction} texts={entrance ? { scanHint: copy.admin.qr.scanHintEntrance, errors: copy.admin.qr.errors } : undefined} />
      </div>
    </ScreenEnter>
  );
}
