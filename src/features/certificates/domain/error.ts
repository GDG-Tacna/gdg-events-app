export type CertificateErrorCode =
  | "invalid-id"
  | "invalid-name"
  | "invalid-title"
  | "invalid-organization"
  | "invalid-linkedin-org"
  | "invalid-date"
  | "invalid-image"
  | "invalid-fields"
  | "invalid-eligibility"
  | "invalid-recipient-name"
  | "invalid-reason"
  | "invalid-code"
  | "already-exists"
  | "not-found"
  | "not-published"
  | "not-eligible"
  | "attendance-required"
  | "has-issued"
  | "edition-locked"
  | "missing-background"
  | "already-revoked"
  | "not-revoked"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface CertificateError {
  code: CertificateErrorCode;
}

export const certificateError = (code: CertificateErrorCode): CertificateError => ({ code });
