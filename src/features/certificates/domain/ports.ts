import type { RecordImages } from "@/features/media";
import type { Result } from "@/shared/lib/result";
import type { IssuedCertificate } from "./certificate";
import type { EligibilityCandidate } from "./eligibility";
import type { CertificateTemplate } from "./template";

export interface CertificateEditionInfo {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface PublishedTemplateEntry {
  edition: CertificateEditionInfo;
  template: CertificateTemplate;
}

/** Per-edition certificate templates repository. */
export interface CertificateTemplateStore {
  /** Every template in the current working/active edition, ordered by `order` then `createdAt`. */
  list(): Promise<Result<readonly CertificateTemplate[], { code: string }>>;
  get(id: string): Promise<Result<CertificateTemplate | null, { code: string }>>;
  /** Reads a template from any edition by explicit `(eventId, templateId)`, used for public verification and cross-edition history. */
  getForEdition(eventId: string, templateId: string): Promise<Result<CertificateTemplate | null, { code: string }>>;
  /** Every published template (with background) across editions where the certificates module is enabled. */
  listAllPublished(): Promise<Result<readonly PublishedTemplateEntry[], { code: string }>>;
  create(template: CertificateTemplate): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  update(template: CertificateTemplate): Promise<Result<void, { code: string }>>;
  remove(id: string): Promise<Result<void, { code: string }>>;
  /** Drops cached template reads after an admin mutation. */
  invalidate?(): void;
}

/** Global `certificates/{code}` + per-edition `certificateClaims/{uid}_{templateId}` repository. */
export interface CertificateStore {
  /**
   * Atomically claims a certificate for `(uid, eventId, templateId)`: if already claimed, returns the existing one
   * (`alreadyClaimed: true`) so retries are idempotent; otherwise allocates an unused code and writes both docs.
   */
  claim(input: {
    eventId: string;
    eventName: string;
    template: CertificateTemplate;
    uid: string;
    recipientName: string;
    recipientEmail: string | null;
    now: Date;
    generateCode: () => string;
  }): Promise<Result<{ certificate: IssuedCertificate; alreadyClaimed: boolean }, { code: string }>>;
  /** Issues a certificate manually from Admin without a claim lock (for guests/speakers without an account). */
  issueManual(input: {
    eventId: string;
    eventName: string;
    template: CertificateTemplate;
    recipientName: string;
    recipientEmail: string | null;
    now: Date;
    generateCode: () => string;
  }): Promise<Result<IssuedCertificate, { code: string }>>;
  findByCode(code: string): Promise<Result<IssuedCertificate | null, { code: string }>>;
  /** Certificates owned by `uid` (and optionally matching verified `email` for pre-issued certificates). */
  listByUid(uid: string, email?: string | null): Promise<Result<readonly IssuedCertificate[], { code: string }>>;
  /** Every certificate issued for the current working/active edition (newest first). */
  listByCurrentEdition(): Promise<Result<readonly IssuedCertificate[], { code: string }>>;
  /** Count of certificates issued for each template in the current edition (keyed by templateId). */
  countByTemplate(): Promise<Result<ReadonlyMap<string, number>, { code: string }>>;
  countForTemplate(templateId: string): Promise<Result<number, { code: string }>>;
  rename(code: string, recipientName: string, now: Date): Promise<Result<{ before: IssuedCertificate; after: IssuedCertificate } | null, { code: string }>>;
  setRevoked(
    code: string,
    revocation: { reason: string; at: Date } | null,
    now: Date,
  ): Promise<Result<{ before: IssuedCertificate; after: IssuedCertificate } | null, { code: string }>>;
}

/** Reads what is needed to evaluate eligibility and suggest a full name for one user in one edition. */
export interface EligibilityLookup {
  lookup(input: { eventId: string; uid: string; email: string | null }): Promise<
    Result<{ candidate: EligibilityCandidate; ticketHolderName: string | null; speakerName: string | null }, { code: string }>
  >;
}

export interface CertificateEditionInfoReader {
  current(): Promise<Result<CertificateEditionInfo, { code: string }>>;
  getById(eventId: string): Promise<Result<CertificateEditionInfo | null, { code: string }>>;
}

export type CertificateAuditAction =
  | "certificate.template.created"
  | "certificate.template.updated"
  | "certificate.template.published"
  | "certificate.template.unpublished"
  | "certificate.template.deleted"
  | "certificate.renamed"
  | "certificate.revoked"
  | "certificate.reinstated"
  | "certificate.issued-manual";

export interface CertificateAudit {
  append(entry: {
    action: CertificateAuditAction;
    actorUid: string;
    targetUid: string;
    details: Record<string, string | null>;
    at: Date;
  }): Promise<Result<void, { code: string }>>;
}

export interface CertificateAnalytics {
  track(event: { name: "certificate_issued"; uid: string; eventId: string; templateId: string }): void;
}

export interface CertificateAdminActor {
  uid: string;
  role: string | null;
  canDelete?: boolean;
}

export interface CertificateUserActor {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface CertificateDeps {
  templates: CertificateTemplateStore;
  certificates: CertificateStore;
  eligibility: EligibilityLookup;
  editions: CertificateEditionInfoReader;
  images: RecordImages;
  audit: CertificateAudit;
  analytics?: CertificateAnalytics;
  randomBytes: (size: number) => Uint8Array;
  now: () => Date;
}
