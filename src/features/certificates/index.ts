// Public client-safe API of the certificates feature. Server-only code lives in `./server`.
export { normalizeCertificateCode, isValidCertificateCode } from "./domain/code";
export { validateRecipientName, RECIPIENT_NAME_MAX, RECIPIENT_NAME_MIN, type RecipientNameErrorCode } from "./domain/name";
export {
  buildLinkedInAddCertUrl,
  buildVerificationUrl,
  type CertificateRenderSpec,
  type ClaimableCertificateItem,
  type IssuedCertificate,
  type PublicCertificate,
  type UserCertificateItem,
} from "./domain/certificate";
export {
  CERTIFICATE_ELIGIBILITY_MODES,
  CERTIFICATE_FIELD_KINDS,
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_FONT_WEIGHTS,
  CERTIFICATE_TEXT_ALIGNS,
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  formatIsoDate,
  parseAllowedEmails,
  suggestTemplateId,
  type CertificateEligibility,
  type CertificateEligibilityMode,
  type CertificateFieldKind,
  type CertificateFieldPlacement,
  type CertificateFontFamily,
  type CertificateFontWeight,
  type CertificateTeamRole,
  type CertificateTemplate,
  type CertificateTemplateDraft,
  type CertificateTemplateSummary,
  type CertificateTextAlign,
} from "./domain/template";
export type { CertificateError, CertificateErrorCode } from "./domain/error";
export type {
  CertificateActionResult,
  ClaimCertificateAction,
  DeleteCertificateTemplateAction,
  IssueManualCertificateAction,
  ReinstateCertificateAction,
  RenameCertificateAction,
  RevokeCertificateAction,
  SaveCertificateTemplateAction,
  ToggleCertificatePublishedAction,
} from "./ui/actions";
export { CertificatePreview, type CertificatePreviewProps } from "./ui/CertificatePreview";
export { CertificatesAdminView, type CertificatesAdminViewProps } from "./ui/CertificatesAdminView";
export { CertificatesDashboardCard, type CertificatesDashboardCardProps } from "./ui/CertificatesDashboardCard";
export { IssuedCertificatesView, type IssuedCertificatesViewProps } from "./ui/IssuedCertificatesView";
export { MyCertificatesView, type MyCertificatesViewProps } from "./ui/MyCertificatesView";
export { TemplateEditorView, type TemplateEditorViewProps } from "./ui/TemplateEditorView";
export { VerifyCertificateView, type VerifyCertificateViewProps } from "./ui/VerifyCertificateView";
export { VerifyLookupForm } from "./ui/VerifyLookupForm";
