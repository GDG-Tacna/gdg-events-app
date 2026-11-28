import "server-only";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { isTicketType } from "@/features/tickets";
import type { IssuedCertificate } from "../../domain/certificate";
import {
  CERTIFICATE_ELIGIBILITY_MODES,
  CERTIFICATE_FIELD_KINDS,
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_FONT_WEIGHTS,
  CERTIFICATE_TEAM_ROLES,
  CERTIFICATE_TEXT_ALIGNS,
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  isTemplateId,
  type CertificateEligibility,
  type CertificateEligibilityMode,
  type CertificateFieldKind,
  type CertificateFieldPlacement,
  type CertificateFontFamily,
  type CertificateFontWeight,
  type CertificateTeamRole,
  type CertificateTemplate,
  type CertificateTextAlign,
} from "../../domain/template";

export function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate(): Date }).toDate();
  }
  return null;
}

const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const optStr = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function parseField(raw: unknown): CertificateFieldPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const id = str(data.id);
  const kind = data.kind as CertificateFieldKind;
  if (!id || !(CERTIFICATE_FIELD_KINDS as readonly string[]).includes(kind)) return null;

  const fontFamily = (CERTIFICATE_FONT_FAMILIES as readonly string[]).includes(data.fontFamily as string)
    ? (data.fontFamily as CertificateFontFamily)
    : "sans";
  const fontWeight = (CERTIFICATE_FONT_WEIGHTS as readonly string[]).includes(data.fontWeight as string)
    ? (data.fontWeight as CertificateFontWeight)
    : "normal";
  const align = (CERTIFICATE_TEXT_ALIGNS as readonly string[]).includes(data.align as string)
    ? (data.align as CertificateTextAlign)
    : "center";
  const color = typeof data.color === "string" && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : "#1e1e1e";
  const prefix = typeof data.prefix === "string" && data.prefix.length > 0 ? data.prefix : undefined;

  return {
    id,
    kind,
    enabled: data.enabled !== false,
    x: num(data.x, 10),
    y: num(data.y, 40),
    width: num(data.width, 80),
    fontSize: num(data.fontSize, 4),
    fontFamily,
    fontWeight,
    color,
    align,
    ...(prefix ? { prefix } : {}),
  };
}

function parseEligibility(raw: unknown): CertificateEligibility {
  if (!raw || typeof raw !== "object") return defaultCertificateEligibility();
  const data = raw as Record<string, unknown>;
  const mode = (CERTIFICATE_ELIGIBILITY_MODES as readonly string[]).includes(data.mode as string)
    ? (data.mode as CertificateEligibilityMode)
    : "tickets";
  const allowedTickets = Array.isArray(data.allowedTickets) ? data.allowedTickets.filter(isTicketType) : [];
  const includeTeamRoles = Array.isArray(data.includeTeamRoles)
    ? data.includeTeamRoles.filter((role): role is CertificateTeamRole => (CERTIFICATE_TEAM_ROLES as readonly string[]).includes(role as string))
    : [];
  const allowedEmails = Array.isArray(data.allowedEmails)
    ? data.allowedEmails.filter((email): email is string => typeof email === "string" && email.includes("@"))
    : [];

  return {
    mode,
    allowedTickets,
    includeSpeakers: Boolean(data.includeSpeakers),
    includeTeamRoles,
    allowedEmails,
    requireAttendance: Boolean(data.requireAttendance),
  };
}

export function mapTemplateDoc(id: string, data: DocumentData | undefined): CertificateTemplate | null {
  if (!isTemplateId(id) || !data || typeof data.name !== "string" || data.name.trim() === "") return null;
  const rawFields = Array.isArray(data.fields) ? data.fields.map(parseField).filter((field): field is CertificateFieldPlacement => field !== null) : [];
  const background = typeof data.backgroundPath === "string" ? imageRefOf(data.backgroundPath, "certificate") : null;
  const createdAt = toDate(data.createdAt) ?? new Date(0);
  const updatedAt = toDate(data.updatedAt) ?? createdAt;

  return {
    id,
    name: data.name,
    credentialTitle: str(data.credentialTitle, data.name),
    organizationName: str(data.organizationName, "GDG Tacna"),
    linkedinOrganizationId: optStr(data.linkedinOrganizationId),
    issueDateText: optStr(data.issueDateText),
    issueDate: toDate(data.issueDate),
    background,
    width: num(data.width, DEFAULT_TEMPLATE_WIDTH),
    height: num(data.height, DEFAULT_TEMPLATE_HEIGHT),
    fields: rawFields.length > 0 ? rawFields : defaultCertificateFields(),
    eligibility: parseEligibility(data.eligibility),
    published: Boolean(data.published),
    order: num(data.order, 0),
    createdAt,
    updatedAt,
  };
}

/** Stores `backgroundPath` (never full URL) so server rebuilds `/media/...` and edition copying finds & duplicates the image. */
export function toTemplateDoc(template: CertificateTemplate): Record<string, unknown> {
  return {
    name: template.name,
    credentialTitle: template.credentialTitle,
    organizationName: template.organizationName,
    linkedinOrganizationId: template.linkedinOrganizationId,
    issueDateText: template.issueDateText,
    issueDate: template.issueDate,
    backgroundPath: template.background?.path ?? null,
    width: template.width,
    height: template.height,
    fields: template.fields.map((field) => ({
      id: field.id,
      kind: field.kind,
      enabled: field.enabled,
      x: field.x,
      y: field.y,
      width: field.width,
      fontSize: field.fontSize,
      fontFamily: field.fontFamily,
      fontWeight: field.fontWeight,
      color: field.color,
      align: field.align,
      ...(field.prefix ? { prefix: field.prefix } : {}),
    })),
    eligibility: {
      mode: template.eligibility.mode,
      allowedTickets: [...template.eligibility.allowedTickets],
      includeSpeakers: template.eligibility.includeSpeakers,
      includeTeamRoles: [...template.eligibility.includeTeamRoles],
      allowedEmails: [...template.eligibility.allowedEmails],
      requireAttendance: template.eligibility.requireAttendance,
    },
    published: template.published,
    order: template.order,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function mapCertificateDoc(code: string, data: DocumentData | undefined): IssuedCertificate | null {
  if (!data || typeof data.recipientName !== "string" || typeof data.eventId !== "string" || typeof data.templateId !== "string") return null;
  const issuedAt = toDate(data.issuedAt) ?? new Date(0);
  const updatedAt = toDate(data.updatedAt) ?? issuedAt;

  return {
    code,
    eventId: data.eventId,
    eventName: str(data.eventName, data.eventId),
    templateId: data.templateId,
    templateName: str(data.templateName, data.templateId),
    credentialTitle: str(data.credentialTitle, str(data.eventName, data.eventId)),
    organizationName: str(data.organizationName, "GDG Tacna"),
    linkedinOrganizationId: optStr(data.linkedinOrganizationId),
    uid: optStr(data.uid),
    recipientName: data.recipientName,
    recipientEmail: optStr(data.recipientEmail),
    issuedAt,
    issueDate: toDate(data.issueDate),
    issueDateText: optStr(data.issueDateText),
    revokedAt: toDate(data.revokedAt),
    revokedReason: optStr(data.revokedReason),
    nameEditedByAdminAt: toDate(data.nameEditedByAdminAt),
    updatedAt,
  };
}

export function toCertificateDoc(cert: IssuedCertificate): Record<string, unknown> {
  return {
    code: cert.code,
    eventId: cert.eventId,
    eventName: cert.eventName,
    templateId: cert.templateId,
    templateName: cert.templateName,
    credentialTitle: cert.credentialTitle,
    organizationName: cert.organizationName,
    linkedinOrganizationId: cert.linkedinOrganizationId,
    uid: cert.uid,
    recipientName: cert.recipientName,
    recipientEmail: cert.recipientEmail,
    issuedAt: cert.issuedAt,
    issueDate: cert.issueDate,
    issueDateText: cert.issueDateText,
    revokedAt: cert.revokedAt,
    revokedReason: cert.revokedReason,
    nameEditedByAdminAt: cert.nameEditedByAdminAt,
    updatedAt: cert.updatedAt,
  };
}
