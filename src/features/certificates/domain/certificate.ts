import type { CertificateFieldPlacement } from "./template";

/** Stored certificate record (`certificates/{code}`): full internal record including server-only owner fields. */
export interface IssuedCertificate {
  code: string;
  eventId: string;
  eventName: string;
  templateId: string;
  templateName: string;
  credentialTitle: string;
  organizationName: string;
  linkedinOrganizationId: string | null;
  /** Firebase Auth UID of the owner, or `null` when issued manually by an admin for an external guest. */
  uid: string | null;
  recipientName: string;
  /** Server-only for admin lookup/export; NEVER sent to public verification pages. */
  recipientEmail: string | null;
  issuedAt: Date;
  issueDate: Date | null;
  issueDateText: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  nameEditedByAdminAt: Date | null;
  updatedAt: Date;
}

/** Visual layout snapshot needed by client components to render/download a certificate. */
export interface CertificateRenderSpec {
  backgroundUrl: string;
  width: number;
  height: number;
  fields: readonly CertificateFieldPlacement[];
}

/** Publicly safe certificate view returned on `/verificar/{code}`: strictly strips `uid` and `recipientEmail`. */
export interface PublicCertificate {
  code: string;
  eventId: string;
  eventName: string;
  credentialTitle: string;
  organizationName: string;
  linkedinOrganizationId: string | null;
  recipientName: string;
  issuedAt: Date;
  issueDate: Date | null;
  issueDateText: string | null;
  status: "valid" | "revoked";
  revokedAt: Date | null;
  render: CertificateRenderSpec | null;
}

/** One issued certificate shown in the signed-in user's `/certificados` history. */
export interface UserCertificateItem extends PublicCertificate {
  templateId: string;
  templateName: string;
}

/** One eligible template the signed-in user has not yet claimed. */
export interface ClaimableCertificateItem {
  eventId: string;
  eventName: string;
  templateId: string;
  templateName: string;
  credentialTitle: string;
  organizationName: string;
  issueDateText: string | null;
  suggestedName: string;
  render: CertificateRenderSpec;
}

/** Strips private owner fields (`uid`, `recipientEmail`, `revokedReason`) before crossing to any public surface. */
export function toPublicCertificate(cert: IssuedCertificate, render: CertificateRenderSpec | null): PublicCertificate {
  return {
    code: cert.code,
    eventId: cert.eventId,
    eventName: cert.eventName,
    credentialTitle: cert.credentialTitle,
    organizationName: cert.organizationName,
    linkedinOrganizationId: cert.linkedinOrganizationId,
    recipientName: cert.recipientName,
    issuedAt: cert.issuedAt,
    issueDate: cert.issueDate,
    issueDateText: cert.issueDateText,
    status: cert.revokedAt ? "revoked" : "valid",
    revokedAt: cert.revokedAt,
    render,
  };
}

/** Builds the canonical public verification URL (`https://app.../verificar/GDG-XXXXX-XXXXX`). */
export function buildVerificationUrl(baseUrl: string, code: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/verificar/${encodeURIComponent(code)}`;
}

/**
 * Builds LinkedIn's official "Add to Profile — Licenses & Certifications" deep link.
 * Passing `organizationId` makes LinkedIn attach the organization's official logo automatically.
 */
export function buildLinkedInAddCertUrl(input: {
  name: string;
  organizationName: string;
  organizationId?: string | null;
  issueDate: Date;
  certId: string;
  certUrl: string;
}): string {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: input.name,
    issueYear: String(input.issueDate.getUTCFullYear()),
    issueMonth: String(input.issueDate.getUTCMonth() + 1),
    certUrl: input.certUrl,
    certId: input.certId,
  });
  if (input.organizationId && /^\d+$/.test(input.organizationId.trim())) {
    params.set("organizationId", input.organizationId.trim());
  } else {
    params.set("organizationName", input.organizationName);
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
