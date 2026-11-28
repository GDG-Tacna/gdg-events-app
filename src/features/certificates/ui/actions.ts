import type { IssuedCertificate, UserCertificateItem } from "../domain/certificate";
import type { CertificateErrorCode } from "../domain/error";
import type { CertificateTemplate, CertificateTemplateDraft } from "../domain/template";

export type CertificateActionResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { value: T }))
  | { ok: false; code: CertificateErrorCode };

export type SaveCertificateTemplateAction = (input: {
  mode: "create" | "edit";
  id: string;
  draft: CertificateTemplateDraft;
}) => Promise<CertificateActionResult<CertificateTemplate>>;

export type ToggleCertificatePublishedAction = (input: {
  id: string;
  published: boolean;
}) => Promise<CertificateActionResult<CertificateTemplate>>;

export type DeleteCertificateTemplateAction = (input: { id: string }) => Promise<CertificateActionResult<{ name: string }>>;

export type ClaimCertificateAction = (input: {
  eventId: string;
  templateId: string;
  recipientName: string;
}) => Promise<CertificateActionResult<UserCertificateItem>>;

export type RenameCertificateAction = (input: {
  code: string;
  recipientName: string;
}) => Promise<CertificateActionResult<IssuedCertificate>>;

export type RevokeCertificateAction = (input: {
  code: string;
  reason: string;
}) => Promise<CertificateActionResult<IssuedCertificate>>;

export type ReinstateCertificateAction = (input: {
  code: string;
}) => Promise<CertificateActionResult<IssuedCertificate>>;

export type IssueManualCertificateAction = (input: {
  templateId: string;
  recipientName: string;
  recipientEmail?: string | null;
}) => Promise<CertificateActionResult<IssuedCertificate>>;
