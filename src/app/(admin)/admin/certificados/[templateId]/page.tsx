import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveCertificateTemplateAction } from "@/app-shell/certificates/admin.actions";
import { certificateDeps } from "@/app-shell/composition/certificates.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { TemplateEditorView } from "@/features/certificates";
import { getCertificateTemplate } from "@/features/certificates/server";
import { getServerEnv } from "@/shared/config/env.server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.adminCertificates.editor.editTitle };

export default async function AdminEditCertificateTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  if (!FEATURES.admin || !(await moduleOn("certificates"))) notFound();
  const session = await requireRole(["admin"]);
  await requireSection(session, "certificates");

  const { templateId } = await params;
  const [found, edition] = await Promise.all([
    getCertificateTemplate(certificateDeps, { uid: session.uid, role: session.role }, templateId),
    certificateDeps.editions.current(),
  ]);
  if (!found.ok) {
    if (found.error.code === "not-found") notFound();
    throw new Error("Could not read certificate template");
  }

  const env = getServerEnv();
  return (
    <ScreenEnter>
      <TemplateEditorView
        mode="edit"
        editionName={edition.ok ? edition.value.name : "DevFest Tacna"}
        initial={found.value}
        save={saveCertificateTemplateAction}
        upload={uploadImageAction}
        backHref={ROUTES.adminCertificates}
        sampleBaseUrl={env.appUrl ?? ""}
      />
    </ScreenEnter>
  );
}
