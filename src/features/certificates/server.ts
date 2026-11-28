import "server-only";

export { CachedCertificateTemplateStore, FirestoreCertificateTemplateStore } from "./data/server/firestore-template-store";
export { FirestoreCertificateStore } from "./data/server/firestore-certificate-store";
export { FirestoreCertificateEditionReader, FirestoreEligibilityLookup } from "./data/server/firestore-eligibility-lookup";
export {
  claimCertificate,
  createCertificateTemplate,
  deleteCertificateTemplate,
  getCertificateTemplate,
  getUserCertificatesOverview,
  issueManualCertificate,
  listCertificateTemplates,
  listEditionCertificates,
  reinstateIssuedCertificate,
  renameIssuedCertificate,
  revokeIssuedCertificate,
  setCertificateTemplatePublished,
  updateCertificateTemplate,
  verifyCertificateByCode,
  type UserCertificatesOverview,
} from "./domain/use-cases";
export type {
  CertificateAdminActor,
  CertificateDeps,
  CertificateEditionInfo,
  CertificateStore,
  CertificateTemplateStore,
  CertificateUserActor,
  EligibilityLookup,
} from "./domain/ports";
export { normalizeCertificateCode } from "./domain/code";
export { buildLinkedInAddCertUrl, buildVerificationUrl, type ClaimableCertificateItem, type IssuedCertificate, type PublicCertificate, type UserCertificateItem } from "./domain/certificate";
export type { CertificateError, CertificateErrorCode } from "./domain/error";
export { defaultCertificateEligibility, defaultCertificateFields, type CertificateTemplate, type CertificateTemplateDraft, type CertificateTemplateSummary } from "./domain/template";
