import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteCertificateTemplateAction, toggleCertificatePublishedAction } from "@/app-shell/certificates/admin.actions";
import { certificateDeps } from "@/app-shell/composition/certificates.server";
import { mayDeleteItems } from "@/app-shell/deletion.server";
import { requireRole } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { CertificatesAdminView } from "@/features/certificates";
import { listCertificateTemplates } from "@/features/certificates/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.adminCertificates.title };

export default async function AdminCertificatesPage() {
  if (!FEATURES.admin || !(await moduleOn("certificates"))) notFound();
  const session = await requireRole(["admin"]);
  await requireSection(session, "certificates");

  const [listed, canDelete] = await Promise.all([
    listCertificateTemplates(certificateDeps, { uid: session.uid, role: session.role }),
    mayDeleteItems(session),
  ]);
  if (!listed.ok) throw new Error("Could not read certificate templates");

  return (
    <ScreenEnter>
      <CertificatesAdminView
        templates={listed.value}
        canDelete={canDelete}
        togglePublished={toggleCertificatePublishedAction}
        remove={deleteCertificateTemplateAction}
        hrefs={{
          create: `${ROUTES.adminCertificates}/nueva`,
          editBase: ROUTES.adminCertificates,
          issued: ROUTES.adminCertificatesIssued,
        }}
      />
    </ScreenEnter>
  );
}
