"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { certificateDeps } from "@/app-shell/composition/certificates.server";
import { mayDeleteItems } from "@/app-shell/deletion.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import type {
  DeleteCertificateTemplateAction,
  IssueManualCertificateAction,
  ReinstateCertificateAction,
  RenameCertificateAction,
  RevokeCertificateAction,
  SaveCertificateTemplateAction,
  ToggleCertificatePublishedAction,
} from "@/features/certificates";
import {
  createCertificateTemplate,
  deleteCertificateTemplate,
  issueManualCertificate,
  reinstateIssuedCertificate,
  renameIssuedCertificate,
  revokeIssuedCertificate,
  setCertificateTemplatePublished,
  updateCertificateTemplate,
} from "@/features/certificates/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";

const fieldSchema = z.object({
  id: z.string(),
  kind: z.enum(["recipientName", "verificationUrl", "verificationCode", "qr", "issueDate", "eventName", "customText"]),
  enabled: z.boolean(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  fontSize: z.number(),
  fontFamily: z.enum(["sans", "serif", "mono"]),
  fontWeight: z.enum(["normal", "semibold", "bold"]),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  prefix: z.string().optional(),
});

const saveTemplateSchema = z.object({
  mode: z.enum(["create", "edit"]),
  id: z.string(),
  draft: z.object({
    name: z.string(),
    credentialTitle: z.string(),
    organizationName: z.string(),
    linkedinOrganizationId: z.string().nullable().optional(),
    issueDateText: z.string().nullable().optional(),
    issueDate: z.string().nullable().optional(),
    backgroundPath: z.string().nullable().optional(),
    width: z.number(),
    height: z.number(),
    fields: z.array(fieldSchema),
    eligibility: z.object({
      mode: z.enum(["tickets", "all", "manual"]),
      allowedTickets: z.array(z.enum(["general", "pro", "premium"])),
      includeSpeakers: z.boolean(),
      includeTeamRoles: z.array(z.enum(["staff", "organizer"])),
      allowedEmails: z.array(z.string()),
      requireAttendance: z.boolean(),
    }),
    published: z.boolean(),
  }),
});

async function requireCertificateAdminEdit() {
  if (!FEATURES.admin || !(await moduleOn("certificates"))) return { ok: false as const, code: "disabled" as const };
  const session = await getSession();
  if (!session) return { ok: false as const, code: "unauthenticated" as const };
  if (session.role !== "admin" || !(await mayEdit(session, ["certificates"]))) return { ok: false as const, code: "forbidden" as const };
  return { ok: true as const, session };
}

function revalidateCertificateSurfaces(code?: string) {
  revalidatePath(ROUTES.adminCertificates);
  revalidatePath(ROUTES.adminCertificatesIssued);
  revalidatePath(ROUTES.certificates);
  revalidatePath(ROUTES.dashboard);
  if (code) revalidatePath(`${ROUTES.verify}/${code}`);
}

export const saveCertificateTemplateAction: SaveCertificateTemplateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = saveTemplateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-fields" };

  const { mode, id, draft } = parsed.data;
  const actor = { uid: auth.session.uid, role: auth.session.role };
  const result =
    mode === "create"
      ? await createCertificateTemplate(certificateDeps, actor, { id, draft })
      : await updateCertificateTemplate(certificateDeps, actor, { id, draft });

  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces();
  revalidatePath(`${ROUTES.adminCertificates}/${id}`);
  return { ok: true, value: result.value };
};

export const toggleCertificatePublishedAction: ToggleCertificatePublishedAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z.object({ id: z.string(), published: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-id" };

  const result = await setCertificateTemplatePublished(certificateDeps, { uid: auth.session.uid, role: auth.session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces();
  return { ok: true, value: result.value };
};

export const deleteCertificateTemplateAction: DeleteCertificateTemplateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z.object({ id: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-id" };

  const canDelete = await mayDeleteItems(auth.session);
  const result = await deleteCertificateTemplate(
    certificateDeps,
    { uid: auth.session.uid, role: auth.session.role, canDelete },
    parsed.data.id,
  );
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces();
  return { ok: true, value: result.value };
};

export const renameIssuedCertificateAction: RenameCertificateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z.object({ code: z.string(), recipientName: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-recipient-name" };

  const result = await renameIssuedCertificate(certificateDeps, { uid: auth.session.uid, role: auth.session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces(result.value.code);
  return { ok: true, value: result.value };
};

export const revokeIssuedCertificateAction: RevokeCertificateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z.object({ code: z.string(), reason: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-reason" };

  const result = await revokeIssuedCertificate(certificateDeps, { uid: auth.session.uid, role: auth.session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces(result.value.code);
  return { ok: true, value: result.value };
};

export const reinstateIssuedCertificateAction: ReinstateCertificateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z.object({ code: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-code" };

  const result = await reinstateIssuedCertificate(certificateDeps, { uid: auth.session.uid, role: auth.session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces(result.value.code);
  return { ok: true, value: result.value };
};

export const issueManualCertificateAction: IssueManualCertificateAction = async (raw) => {
  const auth = await requireCertificateAdminEdit();
  if (!auth.ok) return auth;
  const parsed = z
    .object({
      templateId: z.string(),
      recipientName: z.string(),
      recipientEmail: z.string().nullable().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-recipient-name" };

  const result = await issueManualCertificate(certificateDeps, { uid: auth.session.uid, role: auth.session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidateCertificateSurfaces(result.value.code);
  return { ok: true, value: result.value };
};
