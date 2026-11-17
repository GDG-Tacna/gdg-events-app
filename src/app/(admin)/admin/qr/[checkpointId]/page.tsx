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
  // Only an open talk, entrance or stand can show a code: anything else (unknown id, catering, closed) is not found.
  const point = shown.value.find((candidate) => candidate.id === checkpointId);
  if (!point) notFound();
  // An entrance and a stand are puestos: their screen leads back there, with their own hint.
  const station = point.kind === "entrance" || point.kind === "stand";
  const scanHint = point.kind === "stand" ? copy.admin.qr.scanHintStand : copy.admin.qr.scanHintEntrance;

  return (
    <ScreenEnter>
      <div className="gap-space-4 flex flex-col">
        <div>
          <ButtonLink href={station ? ROUTES.adminCheckpoints : ROUTES.adminTalks} variant="ghost" size="sm" className="-ml-space-4">
            {station ? copy.admin.qr.backEntrance : copy.admin.qr.back}
          </ButtonLink>
        </div>
        <QrDisplay checkpointId={point.id} name={point.name} description={point.description} image={point.image} issue={issueQrAction} texts={station ? { scanHint, errors: copy.admin.qr.errors } : undefined} />
      </div>
    </ScreenEnter>
  );
}
