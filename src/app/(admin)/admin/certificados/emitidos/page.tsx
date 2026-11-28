import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  issueManualCertificateAction,
  reinstateIssuedCertificateAction,
  renameIssuedCertificateAction,
  revokeIssuedCertificateAction,
} from "@/app-shell/certificates/admin.actions";
import { certificateDeps } from "@/app-shell/composition/certificates.server";
import { requireRole } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { IssuedCertificatesView } from "@/features/certificates";
import { listCertificateTemplates, listEditionCertificates } from "@/features/certificates/server";
import { getServerEnv } from "@/shared/config/env.server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.adminCertificates.issued.title };

export default async function AdminIssuedCertificatesPage() {
  if (!FEATURES.admin || !(await moduleOn("certificates"))) notFound();
  const session = await requireRole(["admin"]);
  await requireSection(session, "certificates");

  const actor = { uid: session.uid, role: session.role };
  const [listed, templates] = await Promise.all([
    listEditionCertificates(certificateDeps, actor),
    listCertificateTemplates(certificateDeps, actor),
  ]);
  if (!listed.ok || !templates.ok) throw new Error("Could not read issued certificates");

  const env = getServerEnv();

  return (
    <ScreenEnter>
      <IssuedCertificatesView
        certificates={listed.value}
        templates={templates.value}
        baseUrl={env.appUrl ?? ""}
        backHref={ROUTES.adminCertificates}
        rename={renameIssuedCertificateAction}
        revoke={revokeIssuedCertificateAction}
        reinstate={reinstateIssuedCertificateAction}
        issueManual={issueManualCertificateAction}
      />
    </ScreenEnter>
  );
}
