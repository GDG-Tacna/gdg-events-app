import type { ImageRef } from "@/features/media";
import { TICKET_TYPES, includesCertificate, isTicketType, type TicketType } from "@/features/tickets";
import { err, ok, type Result } from "@/shared/lib/result";
import { certificateError, type CertificateError } from "./error";

export const DEFAULT_TEMPLATE_WIDTH = 2000;
export const DEFAULT_TEMPLATE_HEIGHT = 1414;
export const TEMPLATE_MIN_SIDE = 200;
export const TEMPLATE_MAX_SIDE = 4800;

export const TEMPLATE_NAME_MIN = 2;
export const TEMPLATE_NAME_MAX = 60;
export const CREDENTIAL_TITLE_MIN = 3;
export const CREDENTIAL_TITLE_MAX = 100;
export const ORGANIZATION_NAME_MIN = 2;
export const ORGANIZATION_NAME_MAX = 80;
export const ISSUE_DATE_TEXT_MAX = 80;
export const ALLOWED_EMAILS_MAX = 500;
export const FIELD_PREFIX_MAX = 80;

export const CERTIFICATE_FIELD_KINDS = [
  "recipientName",
  "verificationUrl",
  "verificationCode",
  "qr",
  "issueDate",
  "eventName",
  "customText",
] as const;
export type CertificateFieldKind = (typeof CERTIFICATE_FIELD_KINDS)[number];

export const CERTIFICATE_FONT_FAMILIES = ["sans", "serif", "mono"] as const;
export type CertificateFontFamily = (typeof CERTIFICATE_FONT_FAMILIES)[number];

export const CERTIFICATE_FONT_WEIGHTS = ["normal", "semibold", "bold"] as const;
export type CertificateFontWeight = (typeof CERTIFICATE_FONT_WEIGHTS)[number];

export const CERTIFICATE_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type CertificateTextAlign = (typeof CERTIFICATE_TEXT_ALIGNS)[number];

export const CERTIFICATE_ELIGIBILITY_MODES = ["tickets", "all", "manual"] as const;
export type CertificateEligibilityMode = (typeof CERTIFICATE_ELIGIBILITY_MODES)[number];

export const CERTIFICATE_TEAM_ROLES = ["staff", "organizer"] as const;
export type CertificateTeamRole = (typeof CERTIFICATE_TEAM_ROLES)[number];

/**
 * One dynamic overlay on a certificate template. Positions and widths are stored as percentages [0..100]
 * of the template canvas and font sizes as percentages of template height, so DOM previews and high-resolution
 * Canvas/PDF exports match pixel for pixel regardless of viewport size.
 */
export interface CertificateFieldPlacement {
  id: string;
  kind: CertificateFieldKind;
  enabled: boolean;
  /** Left edge of the box as % of template width (0..100). */
  x: number;
  /** Top edge of the box as % of template height (0..100). */
  y: number;
  /** Width of the box as % of template width (5..100). For `qr`, also controls the square side length. */
  width: number;
  /** Font size as % of template height (0.8..15). Ignored for `qr`. */
  fontSize: number;
  fontFamily: CertificateFontFamily;
  fontWeight: CertificateFontWeight;
  color: string;
  align: CertificateTextAlign;
  /** Optional prefix (e.g. "Verificar en: ") or static text when `kind === "customText"`. */
  prefix?: string;
}

export interface CertificateEligibility {
  mode: CertificateEligibilityMode;
  /** Used when `mode === "tickets"` (defaults to tickets where `includesCertificate(t)` is true). */
  allowedTickets: readonly TicketType[];
  includeSpeakers: boolean;
  includeTeamRoles: readonly CertificateTeamRole[];
  /** Normalized emails always allowed to claim (used for `mode === "manual"` and exceptions in `tickets`). */
  allowedEmails: readonly string[];
  /** Require an entrance check-in (`attendedAt != null`) for attendees qualifying via `all` or `tickets`. */
  requireAttendance: boolean;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  credentialTitle: string;
  organizationName: string;
  /** Optional LinkedIn Company/Organization numeric ID so LinkedIn displays the official logo. */
  linkedinOrganizationId: string | null;
  issueDateText: string | null;
  issueDate: Date | null;
  background: ImageRef | null;
  width: number;
  height: number;
  fields: readonly CertificateFieldPlacement[];
  eligibility: CertificateEligibility;
  published: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificateTemplateSummary extends CertificateTemplate {
  issuedCount: number;
}

export interface CertificateTemplateDraft {
  name: string;
  credentialTitle: string;
  organizationName: string;
  linkedinOrganizationId?: string | null;
  issueDateText?: string | null;
  /** ISO date `YYYY-MM-DD` or empty string. */
  issueDate?: string | null;
  /** Uploaded image path (under `public/{edition}/certificate/...`), `null` to remove, `undefined` to keep. */
  backgroundPath?: string | null;
  width: number;
  height: number;
  fields: readonly CertificateFieldPlacement[];
  eligibility: {
    mode: CertificateEligibilityMode;
    allowedTickets: readonly TicketType[];
    includeSpeakers: boolean;
    includeTeamRoles: readonly CertificateTeamRole[];
    /** Either normalized emails or raw strings parsed/normalized by the server. */
    allowedEmails: readonly string[];
    requireAttendance: boolean;
  };
  published: boolean;
}

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LINKEDIN_ORG_ID = /^\d{1,20}$/;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isTemplateId = (value: unknown): value is string => typeof value === "string" && TEMPLATE_ID_PATTERN.test(value);

/** Suggests a stable slug id from a Spanish template name ("Constancia de participación" -> "constancia-de-participacion"). */
export function suggestTemplateId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Default ticket selection driven by `TICKET_PERKS` (`pro` and `premium`). */
export function defaultCertificateTickets(): TicketType[] {
  return TICKET_TYPES.filter(includesCertificate);
}

/**
 * Sensible starting layout modeled after GDG Tacna's certificate design:
 * large centered recipient name, verification URL at bottom-right, and optional QR/code/date/event/custom fields.
 */
export function defaultCertificateFields(): CertificateFieldPlacement[] {
  return [
    {
      id: "recipientName",
      kind: "recipientName",
      enabled: true,
      x: 10,
      y: 35,
      width: 80,
      fontSize: 5.2,
      fontFamily: "sans",
      fontWeight: "semibold",
      color: "#2b2b2b",
      align: "center",
    },
    {
      id: "verificationUrl",
      kind: "verificationUrl",
      enabled: true,
      x: 56,
      y: 90,
      width: 40,
      fontSize: 1.5,
      fontFamily: "mono",
      fontWeight: "normal",
      color: "#333333",
      align: "right",
      prefix: "Verificar en: ",
    },
    {
      id: "verificationCode",
      kind: "verificationCode",
      enabled: false,
      x: 6,
      y: 90,
      width: 35,
      fontSize: 1.6,
      fontFamily: "mono",
      fontWeight: "semibold",
      color: "#333333",
      align: "left",
      prefix: "Código: ",
    },
    {
      id: "qr",
      kind: "qr",
      enabled: false,
      x: 84,
      y: 72,
      width: 11,
      fontSize: 2,
      fontFamily: "sans",
      fontWeight: "normal",
      color: "#1e1e1e",
      align: "center",
    },
    {
      id: "issueDate",
      kind: "issueDate",
      enabled: false,
      x: 20,
      y: 80,
      width: 30,
      fontSize: 2.2,
      fontFamily: "sans",
      fontWeight: "normal",
      color: "#333333",
      align: "left",
    },
    {
      id: "eventName",
      kind: "eventName",
      enabled: false,
      x: 15,
      y: 52,
      width: 70,
      fontSize: 2.8,
      fontFamily: "sans",
      fontWeight: "bold",
      color: "#1e1e1e",
      align: "center",
    },
    {
      id: "customText",
      kind: "customText",
      enabled: false,
      x: 15,
      y: 26,
      width: 70,
      fontSize: 2.4,
      fontFamily: "sans",
      fontWeight: "normal",
      color: "#333333",
      align: "center",
      prefix: "",
    },
  ];
}

export function defaultCertificateEligibility(): CertificateEligibility {
  return {
    mode: "tickets",
    allowedTickets: defaultCertificateTickets(),
    includeSpeakers: false,
    includeTeamRoles: [],
    allowedEmails: [],
    requireAttendance: false,
  };
}

/** Splits pasted text (newlines, commas, semicolons or tabs) into normalized deduplicated emails + invalid entries. */
export function parseAllowedEmails(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\r\n,;\t]+/)) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!SIMPLE_EMAIL.test(email)) {
      invalid.push(part.trim());
      continue;
    }
    if (!seen.has(email)) {
      seen.add(email);
      valid.push(email);
    }
  }
  return { valid, invalid };
}

export function parseIssueDate(raw: string | null | undefined): Result<Date | null, CertificateError> {
  if (raw === undefined || raw === null || raw.trim() === "") return ok(null);
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return err(certificateError("invalid-date"));
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return err(certificateError("invalid-date"));
  }
  return ok(date);
}

export function formatIsoDate(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
const isFiniteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface ValidatedTemplateData {
  name: string;
  credentialTitle: string;
  organizationName: string;
  linkedinOrganizationId: string | null;
  issueDateText: string | null;
  issueDate: Date | null;
  width: number;
  height: number;
  fields: CertificateFieldPlacement[];
  eligibility: CertificateEligibility;
  published: boolean;
}

/** Validates every field of a template draft on the server (and client before submit). */
export function validateTemplateDraft(draft: CertificateTemplateDraft): Result<ValidatedTemplateData, CertificateError> {
  const name = tidy(draft.name);
  if (name.length < TEMPLATE_NAME_MIN || name.length > TEMPLATE_NAME_MAX) return err(certificateError("invalid-name"));

  const credentialTitle = tidy(draft.credentialTitle);
  if (credentialTitle.length < CREDENTIAL_TITLE_MIN || credentialTitle.length > CREDENTIAL_TITLE_MAX) {
    return err(certificateError("invalid-title"));
  }

  const organizationName = tidy(draft.organizationName);
  if (organizationName.length < ORGANIZATION_NAME_MIN || organizationName.length > ORGANIZATION_NAME_MAX) {
    return err(certificateError("invalid-organization"));
  }

  const rawOrgId = (draft.linkedinOrganizationId ?? "").trim();
  if (rawOrgId !== "" && !LINKEDIN_ORG_ID.test(rawOrgId)) return err(certificateError("invalid-linkedin-org"));
  const linkedinOrganizationId = rawOrgId === "" ? null : rawOrgId;

  const rawDateText = tidy(draft.issueDateText ?? "");
  if (rawDateText.length > ISSUE_DATE_TEXT_MAX) return err(certificateError("invalid-date"));
  const issueDateText = rawDateText === "" ? null : rawDateText;

  const parsedDate = parseIssueDate(draft.issueDate);
  if (!parsedDate.ok) return parsedDate;

  if (!isFiniteInRange(draft.width, TEMPLATE_MIN_SIDE, TEMPLATE_MAX_SIDE) || !isFiniteInRange(draft.height, TEMPLATE_MIN_SIDE, TEMPLATE_MAX_SIDE)) {
    return err(certificateError("invalid-fields"));
  }
  const width = Math.round(draft.width);
  const height = Math.round(draft.height);

  if (!Array.isArray(draft.fields) || draft.fields.length === 0 || draft.fields.length > 20) {
    return err(certificateError("invalid-fields"));
  }
  const seenIds = new Set<string>();
  const fields: CertificateFieldPlacement[] = [];
  for (const field of draft.fields) {
    if (
      typeof field.id !== "string" ||
      field.id.length < 1 ||
      field.id.length > 40 ||
      seenIds.has(field.id) ||
      !(CERTIFICATE_FIELD_KINDS as readonly string[]).includes(field.kind) ||
      typeof field.enabled !== "boolean" ||
      !isFiniteInRange(field.x, 0, 95) ||
      !isFiniteInRange(field.y, 0, 95) ||
      !isFiniteInRange(field.width, 5, 100) ||
      !isFiniteInRange(field.fontSize, 0.8, 15) ||
      !(CERTIFICATE_FONT_FAMILIES as readonly string[]).includes(field.fontFamily) ||
      !(CERTIFICATE_FONT_WEIGHTS as readonly string[]).includes(field.fontWeight) ||
      !(CERTIFICATE_TEXT_ALIGNS as readonly string[]).includes(field.align) ||
      typeof field.color !== "string" ||
      !HEX_COLOR.test(field.color)
    ) {
      return err(certificateError("invalid-fields"));
    }
    const prefix = typeof field.prefix === "string" ? field.prefix.slice(0, FIELD_PREFIX_MAX) : undefined;
    seenIds.add(field.id);
    fields.push({
      id: field.id,
      kind: field.kind,
      enabled: field.enabled,
      x: round2(field.x),
      y: round2(field.y),
      width: round2(Math.min(field.width, 100 - field.x)),
      fontSize: round2(field.fontSize),
      fontFamily: field.fontFamily,
      fontWeight: field.fontWeight,
      color: field.color.toLowerCase(),
      align: field.align,
      ...(prefix !== undefined && prefix !== "" ? { prefix } : {}),
    });
  }
  // Every certificate template must print the recipient's name somewhere.
  if (!fields.some((field) => field.kind === "recipientName" && field.enabled)) {
    return err(certificateError("invalid-fields"));
  }

  const rawElig = draft.eligibility;
  if (!rawElig || !(CERTIFICATE_ELIGIBILITY_MODES as readonly string[]).includes(rawElig.mode)) {
    return err(certificateError("invalid-eligibility"));
  }
  if (!Array.isArray(rawElig.allowedTickets) || !rawElig.allowedTickets.every(isTicketType)) {
    return err(certificateError("invalid-eligibility"));
  }
  const allowedTickets = TICKET_TYPES.filter((type) => rawElig.allowedTickets.includes(type));

  if (!Array.isArray(rawElig.includeTeamRoles) || !rawElig.includeTeamRoles.every((role) => (CERTIFICATE_TEAM_ROLES as readonly string[]).includes(role))) {
    return err(certificateError("invalid-eligibility"));
  }
  const includeTeamRoles = CERTIFICATE_TEAM_ROLES.filter((role) => rawElig.includeTeamRoles.includes(role));

  if (!Array.isArray(rawElig.allowedEmails) || rawElig.allowedEmails.length > ALLOWED_EMAILS_MAX) {
    return err(certificateError("invalid-eligibility"));
  }
  const emailSet = new Set<string>();
  const allowedEmails: string[] = [];
  for (const rawEmail of rawElig.allowedEmails) {
    if (typeof rawEmail !== "string") return err(certificateError("invalid-eligibility"));
    const normalized = rawEmail.trim().toLowerCase();
    if (!normalized) continue;
    if (!SIMPLE_EMAIL.test(normalized)) return err(certificateError("invalid-eligibility"));
    if (!emailSet.has(normalized)) {
      emailSet.add(normalized);
      allowedEmails.push(normalized);
    }
  }

  const includeSpeakers = Boolean(rawElig.includeSpeakers);
  const requireAttendance = Boolean(rawElig.requireAttendance);
  if (rawElig.mode === "tickets" && allowedTickets.length === 0 && allowedEmails.length === 0 && !includeSpeakers && includeTeamRoles.length === 0) {
    return err(certificateError("invalid-eligibility"));
  }
  if (rawElig.mode === "manual" && allowedEmails.length === 0 && !includeSpeakers && includeTeamRoles.length === 0) {
    return err(certificateError("invalid-eligibility"));
  }

  return ok({
    name,
    credentialTitle,
    organizationName,
    linkedinOrganizationId,
    issueDateText,
    issueDate: parsedDate.value,
    width,
    height,
    fields,
    eligibility: {
      mode: rawElig.mode,
      allowedTickets,
      includeSpeakers,
      includeTeamRoles,
      allowedEmails,
      requireAttendance,
    },
    published: Boolean(draft.published),
  });
}
