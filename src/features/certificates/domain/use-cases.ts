import { chooseImage, dropReplacedImage } from "@/features/media";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  toPublicCertificate,
  type CertificateRenderSpec,
  type ClaimableCertificateItem,
  type IssuedCertificate,
  type PublicCertificate,
  type UserCertificateItem,
} from "./certificate";
import { generateCertificateCode, normalizeCertificateCode } from "./code";
import { evaluateEligibility } from "./eligibility";
import { certificateError, type CertificateError } from "./error";
import { suggestRecipientName, validateRecipientName } from "./name";
import type { CertificateAdminActor, CertificateAuditAction, CertificateDeps, CertificateUserActor } from "./ports";
import {
  isTemplateId,
  validateTemplateDraft,
  type CertificateTemplate,
  type CertificateTemplateDraft,
  type CertificateTemplateSummary,
} from "./template";

const REVOKE_REASON_MIN = 3;
const REVOKE_REASON_MAX = 200;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isAdmin = (actor: CertificateAdminActor) => actor.role === "admin";

function renderSpecOf(template: CertificateTemplate | null): CertificateRenderSpec | null {
  if (!template?.background) return null;
  return {
    backgroundUrl: template.background.url,
    width: template.width,
    height: template.height,
    fields: template.fields,
  };
}

async function recordAudit(
  deps: Pick<CertificateDeps, "audit" | "now">,
  entry: { action: CertificateAuditAction; actorUid: string; targetUid: string; details: Record<string, string | null> },
): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("certificates.audit", new Error(`audit entry missing for ${entry.action} on ${entry.targetUid}`));
}

/** Lists every certificate template in the working edition along with its issued count. */
export async function listCertificateTemplates(
  deps: Pick<CertificateDeps, "templates" | "certificates">,
  actor: CertificateAdminActor,
): Promise<Result<readonly CertificateTemplateSummary[], CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  const [listed, counts] = await Promise.all([deps.templates.list(), deps.certificates.countByTemplate()]);
  if (!listed.ok) return err(certificateError("unknown"));
  const countMap = counts.ok ? counts.value : new Map<string, number>();
  return ok(listed.value.map((template) => ({ ...template, issuedCount: countMap.get(template.id) ?? 0 })));
}

/** Fetches one certificate template in the working edition for editing. */
export async function getCertificateTemplate(
  deps: Pick<CertificateDeps, "templates">,
  actor: CertificateAdminActor,
  templateId: string,
): Promise<Result<CertificateTemplate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (!isTemplateId(templateId)) return err(certificateError("not-found"));
  const found = await deps.templates.get(templateId);
  if (!found.ok) return err(certificateError("unknown"));
  if (!found.value) return err(certificateError("not-found"));
  return ok(found.value);
}

/** Creates a new certificate template in the working edition. */
export async function createCertificateTemplate(
  deps: Pick<CertificateDeps, "templates" | "images" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { id: string; draft: CertificateTemplateDraft },
): Promise<Result<CertificateTemplate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (!isTemplateId(input.id)) return err(certificateError("invalid-id"));
  const checked = validateTemplateDraft(input.draft);
  if (!checked.ok) return checked;

  const choice = chooseImage(deps.images, "certificate", input.draft.backgroundPath);
  if (!choice) return err(certificateError("invalid-image"));
  const background = choice.keep ? null : choice.image;
  if (checked.value.published && !background) return err(certificateError("missing-background"));

  const existing = await deps.templates.list();
  if (!existing.ok) return err(certificateError("unknown"));
  const order = existing.value.reduce((max, item) => Math.max(max, item.order), -1) + 1;

  const now = deps.now();
  const template: CertificateTemplate = {
    id: input.id,
    ...checked.value,
    background,
    order,
    createdAt: now,
    updatedAt: now,
  };
  const created = await deps.templates.create(template);
  if (!created.ok) return err(certificateError(created.error.code === "already-exists" ? "already-exists" : "unknown"));
  deps.templates.invalidate?.();

  await recordAudit(deps, {
    action: "certificate.template.created",
    actorUid: actor.uid,
    targetUid: template.id,
    details: { name: template.name, mode: template.eligibility.mode, published: String(template.published) },
  });
  return ok(template);
}

/** Updates an existing certificate template in the working edition and cleans up any replaced background image. */
export async function updateCertificateTemplate(
  deps: Pick<CertificateDeps, "templates" | "images" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { id: string; draft: CertificateTemplateDraft },
): Promise<Result<CertificateTemplate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (!isTemplateId(input.id)) return err(certificateError("not-found"));
  const checked = validateTemplateDraft(input.draft);
  if (!checked.ok) return checked;

  const found = await deps.templates.get(input.id);
  if (!found.ok) return err(certificateError("unknown"));
  if (!found.value) return err(certificateError("not-found"));

  const choice = chooseImage(deps.images, "certificate", input.draft.backgroundPath);
  if (!choice) return err(certificateError("invalid-image"));
  const background = choice.keep ? found.value.background : choice.image;
  if (checked.value.published && !background) return err(certificateError("missing-background"));

  const updated: CertificateTemplate = {
    ...found.value,
    ...checked.value,
    background,
    updatedAt: deps.now(),
  };
  const saved = await deps.templates.update(updated);
  if (!saved.ok) return err(certificateError("unknown"));
  deps.templates.invalidate?.();
  await dropReplacedImage(deps.images, found.value.background, background);

  await recordAudit(deps, {
    action: "certificate.template.updated",
    actorUid: actor.uid,
    targetUid: updated.id,
    details: { name: updated.name, mode: updated.eligibility.mode, published: String(updated.published) },
  });
  return ok(updated);
}

/** Publishes or unpublishes a template. Publishing requires a background image. */
export async function setCertificateTemplatePublished(
  deps: Pick<CertificateDeps, "templates" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { id: string; published: boolean },
): Promise<Result<CertificateTemplate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (!isTemplateId(input.id)) return err(certificateError("not-found"));
  const found = await deps.templates.get(input.id);
  if (!found.ok) return err(certificateError("unknown"));
  if (!found.value) return err(certificateError("not-found"));
  if (input.published && !found.value.background) return err(certificateError("missing-background"));

  const updated: CertificateTemplate = { ...found.value, published: input.published, updatedAt: deps.now() };
  const saved = await deps.templates.update(updated);
  if (!saved.ok) return err(certificateError("unknown"));
  deps.templates.invalidate?.();

  await recordAudit(deps, {
    action: input.published ? "certificate.template.published" : "certificate.template.unpublished",
    actorUid: actor.uid,
    targetUid: updated.id,
    details: { name: updated.name },
  });
  return ok(updated);
}

/**
 * Deletes a template only while zero certificates have been issued for it (and edition deletion policy allows it),
 * so verification links shared on LinkedIn can never lose their template image or layout.
 */
export async function deleteCertificateTemplate(
  deps: Pick<CertificateDeps, "templates" | "certificates" | "images" | "audit" | "now">,
  actor: CertificateAdminActor,
  templateId: string,
): Promise<Result<{ name: string }, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (actor.canDelete === false) return err(certificateError("edition-locked"));
  if (!isTemplateId(templateId)) return err(certificateError("not-found"));

  const found = await deps.templates.get(templateId);
  if (!found.ok) return err(certificateError("unknown"));
  if (!found.value) return err(certificateError("not-found"));

  const issued = await deps.certificates.countForTemplate(templateId);
  if (!issued.ok) return err(certificateError("unknown"));
  if (issued.value > 0) return err(certificateError("has-issued"));

  const removed = await deps.templates.remove(templateId);
  if (!removed.ok) return err(certificateError("unknown"));
  deps.templates.invalidate?.();
  if (found.value.background) await deps.images.remove(found.value.background.path);

  await recordAudit(deps, {
    action: "certificate.template.deleted",
    actorUid: actor.uid,
    targetUid: templateId,
    details: { name: found.value.name },
  });
  return ok({ name: found.value.name });
}

export interface UserCertificatesOverview {
  claimable: readonly ClaimableCertificateItem[];
  issued: readonly UserCertificateItem[];
}

/**
 * Loads everything for the signed-in user's `/certificados` screen:
 * - all previously issued certificates across every edition (with visual render specs)
 * - all eligible unclaimed certificates across editions with published templates (with suggested full name).
 */
export async function getUserCertificatesOverview(
  deps: Pick<CertificateDeps, "templates" | "certificates" | "eligibility">,
  actor: CertificateUserActor,
): Promise<Result<UserCertificatesOverview, CertificateError>> {
  const [issuedResult, publishedResult] = await Promise.all([
    deps.certificates.listByUid(actor.uid, actor.email),
    deps.templates.listAllPublished(),
  ]);
  if (!issuedResult.ok || !publishedResult.ok) return err(certificateError("unknown"));

  const issuedList = issuedResult.value;
  const publishedEntries = publishedResult.value;

  // Map already-loaded published templates to avoid redundant lookups when building render specs.
  const templateByKey = new Map<string, CertificateTemplate>();
  for (const entry of publishedEntries) {
    templateByKey.set(`${entry.edition.id}:${entry.template.id}`, entry.template);
  }

  // Hydrate render specs for issued certificates (including those whose templates were later unpublished).
  const issued: UserCertificateItem[] = await Promise.all(
    issuedList.map(async (cert) => {
      const key = `${cert.eventId}:${cert.templateId}`;
      let template = templateByKey.get(key) ?? null;
      if (!template) {
        const fetched = await deps.templates.getForEdition(cert.eventId, cert.templateId);
        template = fetched.ok ? fetched.value : null;
        if (template) templateByKey.set(key, template);
      }
      return {
        ...toPublicCertificate(cert, renderSpecOf(template)),
        templateId: cert.templateId,
        templateName: cert.templateName,
      };
    }),
  );

  // Track which (eventId, templateId) pairs the user already owns so they are not offered again.
  const ownedKeys = new Set(issuedList.map((cert) => `${cert.eventId}:${cert.templateId}`));
  const unclaimedEntries = publishedEntries.filter((entry) => !ownedKeys.has(`${entry.edition.id}:${entry.template.id}`));

  // Lookup candidate eligibility once per distinct edition with unclaimed published templates.
  const editionIds = [...new Set(unclaimedEntries.map((entry) => entry.edition.id))];
  const candidateByEdition = new Map<string, Awaited<ReturnType<typeof deps.eligibility.lookup>>>();
  await Promise.all(
    editionIds.map(async (eventId) => {
      const lookup = await deps.eligibility.lookup({ eventId, uid: actor.uid, email: actor.email });
      candidateByEdition.set(eventId, lookup);
    }),
  );

  const claimable: ClaimableCertificateItem[] = [];
  for (const { edition, template } of unclaimedEntries) {
    const spec = renderSpecOf(template);
    if (!spec) continue;
    const lookup = candidateByEdition.get(edition.id);
    if (!lookup || !lookup.ok) continue;
    const verdict = evaluateEligibility(template, lookup.value.candidate);
    if (!verdict.eligible) continue;

    claimable.push({
      eventId: edition.id,
      eventName: edition.name,
      templateId: template.id,
      templateName: template.name,
      credentialTitle: template.credentialTitle,
      organizationName: template.organizationName,
      issueDateText: template.issueDateText,
      suggestedName: suggestRecipientName({
        ticketHolderName: lookup.value.ticketHolderName,
        speakerName: lookup.value.speakerName,
        accountDisplayName: actor.displayName,
      }),
      render: spec,
    });
  }

  return ok({ claimable, issued });
}

/**
 * Claims and locks a certificate for the signed-in user after re-validating eligibility and full name on the server.
 * Idempotent per `(uid, eventId, templateId)`: retrying returns the already issued certificate without creating a second code.
 */
export async function claimCertificate(
  deps: Pick<CertificateDeps, "templates" | "certificates" | "eligibility" | "editions" | "analytics" | "randomBytes" | "now">,
  actor: CertificateUserActor,
  input: { eventId: string; templateId: string; recipientName: string },
): Promise<Result<UserCertificateItem, CertificateError>> {
  if (!isTemplateId(input.templateId)) return err(certificateError("not-found"));
  const checkedName = validateRecipientName(input.recipientName);
  if (!checkedName.ok) return err(certificateError("invalid-recipient-name"));

  const [templateResult, editionResult, lookupResult] = await Promise.all([
    deps.templates.getForEdition(input.eventId, input.templateId),
    deps.editions.getById(input.eventId),
    deps.eligibility.lookup({ eventId: input.eventId, uid: actor.uid, email: actor.email }),
  ]);
  if (!templateResult.ok || !editionResult.ok || !lookupResult.ok) return err(certificateError("unknown"));
  const template = templateResult.value;
  if (!template) return err(certificateError("not-found"));

  const verdict = evaluateEligibility(template, lookupResult.value.candidate);
  if (!verdict.eligible) {
    if (verdict.reason === "not-published") return err(certificateError("not-published"));
    if (verdict.reason === "missing-background") return err(certificateError("missing-background"));
    if (verdict.reason === "attendance-required") return err(certificateError("attendance-required"));
    return err(certificateError("not-eligible"));
  }

  const eventName = editionResult.value?.name || input.eventId;
  const claimed = await deps.certificates.claim({
    eventId: input.eventId,
    eventName,
    template,
    uid: actor.uid,
    recipientName: checkedName.value,
    recipientEmail: actor.email ? actor.email.trim().toLowerCase() : null,
    now: deps.now(),
    generateCode: () => generateCertificateCode(deps.randomBytes),
  });
  if (!claimed.ok) return err(certificateError("unknown"));

  if (!claimed.value.alreadyClaimed) {
    deps.analytics?.track({
      name: "certificate_issued",
      uid: actor.uid,
      eventId: input.eventId,
      templateId: template.id,
    });
  }

  return ok({
    ...toPublicCertificate(claimed.value.certificate, renderSpecOf(template)),
    templateId: template.id,
    templateName: template.name,
  });
}

/** Public verification lookup by code (`/verificar/{code}`): returns strictly non-private certificate details. */
export async function verifyCertificateByCode(
  deps: Pick<CertificateDeps, "certificates" | "templates">,
  rawCode: string,
): Promise<Result<PublicCertificate | null, CertificateError>> {
  const code = normalizeCertificateCode(rawCode);
  if (!code) return err(certificateError("invalid-code"));
  const found = await deps.certificates.findByCode(code);
  if (!found.ok) return err(certificateError("unknown"));
  if (!found.value) return ok(null);

  const template = await deps.templates.getForEdition(found.value.eventId, found.value.templateId);
  const spec = template.ok ? renderSpecOf(template.value) : null;
  return ok(toPublicCertificate(found.value, spec));
}

/** Lists every certificate issued for the working edition (admin screen). */
export async function listEditionCertificates(
  deps: Pick<CertificateDeps, "certificates">,
  actor: CertificateAdminActor,
): Promise<Result<readonly IssuedCertificate[], CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  const listed = await deps.certificates.listByCurrentEdition();
  return listed.ok ? ok(listed.value) : err(certificateError("unknown"));
}

/** Admin correction for a typo in an already-locked certificate name. Audited. */
export async function renameIssuedCertificate(
  deps: Pick<CertificateDeps, "certificates" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { code: string; recipientName: string },
): Promise<Result<IssuedCertificate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  const code = normalizeCertificateCode(input.code);
  if (!code) return err(certificateError("invalid-code"));
  const checkedName = validateRecipientName(input.recipientName);
  if (!checkedName.ok) return err(certificateError("invalid-recipient-name"));

  const updated = await deps.certificates.rename(code, checkedName.value, deps.now());
  if (!updated.ok) return err(certificateError("unknown"));
  if (!updated.value) return err(certificateError("not-found"));

  if (updated.value.before.recipientName !== updated.value.after.recipientName) {
    await recordAudit(deps, {
      action: "certificate.renamed",
      actorUid: actor.uid,
      targetUid: code,
      details: { from: updated.value.before.recipientName, to: updated.value.after.recipientName },
    });
  }
  return ok(updated.value.after);
}

/** Admin revocation of a certificate (preserves audit trail; public verification shows it as revoked). */
export async function revokeIssuedCertificate(
  deps: Pick<CertificateDeps, "certificates" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { code: string; reason: string },
): Promise<Result<IssuedCertificate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  const code = normalizeCertificateCode(input.code);
  if (!code) return err(certificateError("invalid-code"));
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < REVOKE_REASON_MIN || reason.length > REVOKE_REASON_MAX) return err(certificateError("invalid-reason"));

  const current = await deps.certificates.findByCode(code);
  if (!current.ok) return err(certificateError("unknown"));
  if (!current.value) return err(certificateError("not-found"));
  if (current.value.revokedAt !== null) return err(certificateError("already-revoked"));

  const now = deps.now();
  const updated = await deps.certificates.setRevoked(code, { reason, at: now }, now);
  if (!updated.ok) return err(certificateError("unknown"));
  if (!updated.value) return err(certificateError("not-found"));

  await recordAudit(deps, {
    action: "certificate.revoked",
    actorUid: actor.uid,
    targetUid: code,
    details: { recipientName: updated.value.after.recipientName, reason },
  });
  return ok(updated.value.after);
}

/** Admin reinstatement of a previously revoked certificate. */
export async function reinstateIssuedCertificate(
  deps: Pick<CertificateDeps, "certificates" | "audit" | "now">,
  actor: CertificateAdminActor,
  input: { code: string },
): Promise<Result<IssuedCertificate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  const code = normalizeCertificateCode(input.code);
  if (!code) return err(certificateError("invalid-code"));

  const current = await deps.certificates.findByCode(code);
  if (!current.ok) return err(certificateError("unknown"));
  if (!current.value) return err(certificateError("not-found"));
  if (current.value.revokedAt === null) return err(certificateError("not-revoked"));

  const updated = await deps.certificates.setRevoked(code, null, deps.now());
  if (!updated.ok) return err(certificateError("unknown"));
  if (!updated.value) return err(certificateError("not-found"));

  await recordAudit(deps, {
    action: "certificate.reinstated",
    actorUid: actor.uid,
    targetUid: code,
    details: { recipientName: updated.value.after.recipientName },
  });
  return ok(updated.value.after);
}

/** Admin manual issuance of a verifiable certificate for someone without an app account (e.g. external speaker/VIP). */
export async function issueManualCertificate(
  deps: Pick<CertificateDeps, "templates" | "certificates" | "editions" | "audit" | "randomBytes" | "now">,
  actor: CertificateAdminActor,
  input: { templateId: string; recipientName: string; recipientEmail?: string | null },
): Promise<Result<IssuedCertificate, CertificateError>> {
  if (!isAdmin(actor)) return err(certificateError("forbidden"));
  if (!isTemplateId(input.templateId)) return err(certificateError("not-found"));
  const checkedName = validateRecipientName(input.recipientName);
  if (!checkedName.ok) return err(certificateError("invalid-recipient-name"));

  const rawEmail = (input.recipientEmail ?? "").trim().toLowerCase();
  if (rawEmail !== "" && !SIMPLE_EMAIL.test(rawEmail)) return err(certificateError("invalid-eligibility"));
  const recipientEmail = rawEmail === "" ? null : rawEmail;

  const [templateResult, editionResult] = await Promise.all([deps.templates.get(input.templateId), deps.editions.current()]);
  if (!templateResult.ok || !editionResult.ok) return err(certificateError("unknown"));
  if (!templateResult.value) return err(certificateError("not-found"));
  if (!templateResult.value.background) return err(certificateError("missing-background"));

  const issued = await deps.certificates.issueManual({
    eventId: editionResult.value.id,
    eventName: editionResult.value.name,
    template: templateResult.value,
    recipientName: checkedName.value,
    recipientEmail,
    now: deps.now(),
    generateCode: () => generateCertificateCode(deps.randomBytes),
  });
  if (!issued.ok) return err(certificateError("unknown"));

  await recordAudit(deps, {
    action: "certificate.issued-manual",
    actorUid: actor.uid,
    targetUid: issued.value.code,
    details: { templateId: templateResult.value.id, recipientName: issued.value.recipientName },
  });
  return ok(issued.value);
}
