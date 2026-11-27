import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { IssuedCertificate } from "./certificate";
import type { CertificateDeps } from "./ports";
import {
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  type CertificateTemplate,
  type CertificateTemplateDraft,
} from "./template";
import {
  claimCertificate,
  createCertificateTemplate,
  deleteCertificateTemplate,
  getUserCertificatesOverview,
  issueManualCertificate,
  renameIssuedCertificate,
  revokeIssuedCertificate,
  verifyCertificateByCode,
} from "./use-cases";

const BG_PATH = "public/devfest-2026/certificate/abcdef123456.webp";
const BG_REF = { path: BG_PATH, url: `/media/${BG_PATH}` };
const NOW = new Date("2026-11-23T15:00:00Z");

const sampleTemplate = (overrides: Partial<CertificateTemplate> = {}): CertificateTemplate => ({
  id: "asistente",
  name: "Constancia de participación",
  credentialTitle: "DevFest Tacna 2026 - Participación",
  organizationName: "GDG Tacna",
  linkedinOrganizationId: null,
  issueDateText: "22 de Noviembre del 2026",
  issueDate: new Date("2026-11-22T12:00:00Z"),
  background: BG_REF,
  width: DEFAULT_TEMPLATE_WIDTH,
  height: DEFAULT_TEMPLATE_HEIGHT,
  fields: defaultCertificateFields(),
  eligibility: defaultCertificateEligibility(),
  published: true,
  order: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const sampleIssued = (overrides: Partial<IssuedCertificate> = {}): IssuedCertificate => ({
  code: "GDG-23456-789AB",
  eventId: "devfest-2026",
  eventName: "DevFest Tacna 2026",
  templateId: "asistente",
  templateName: "Constancia de participación",
  credentialTitle: "DevFest Tacna 2026 - Participación",
  organizationName: "GDG Tacna",
  linkedinOrganizationId: null,
  uid: "u1",
  recipientName: "Sebastian Fuentes",
  recipientEmail: "sebastian@example.com",
  issuedAt: NOW,
  issueDate: new Date("2026-11-22T12:00:00Z"),
  issueDateText: "22 de Noviembre del 2026",
  revokedAt: null,
  revokedReason: null,
  nameEditedByAdminAt: null,
  updatedAt: NOW,
  ...overrides,
});

function makeDeps(overrides: Partial<CertificateDeps> = {}): CertificateDeps {
  const tpl = sampleTemplate();
  return {
    templates: {
      list: vi.fn(async () => ok([tpl])),
      get: vi.fn(async (id) => ok(id === tpl.id ? tpl : null)),
      getForEdition: vi.fn(async (_eventId, id) => ok(id === tpl.id ? tpl : null)),
      listAllPublished: vi.fn(async () => ok([{ edition: { id: "devfest-2026", name: "DevFest Tacna 2026", startsAt: null, endsAt: null }, template: tpl }])),
      create: vi.fn(async () => ok(undefined)),
      update: vi.fn(async () => ok(undefined)),
      remove: vi.fn(async () => ok(undefined)),
      invalidate: vi.fn(),
    },
    certificates: {
      claim: vi.fn(async ({ recipientName, generateCode }) =>
        ok({ certificate: sampleIssued({ code: generateCode(), recipientName }), alreadyClaimed: false }),
      ),
      issueManual: vi.fn(async ({ recipientName, recipientEmail, generateCode }) =>
        ok(sampleIssued({ code: generateCode(), uid: null, recipientName, recipientEmail })),
      ),
      findByCode: vi.fn(async (code) => ok(code === "GDG-23456-789AB" ? sampleIssued() : null)),
      listByUid: vi.fn(async () => ok([])),
      listByCurrentEdition: vi.fn(async () => ok([sampleIssued()])),
      countByTemplate: vi.fn(async () => ok(new Map([["asistente", 1]]))),
      countForTemplate: vi.fn(async () => ok(0)),
      rename: vi.fn(async (code, recipientName) => ok({ before: sampleIssued({ code }), after: sampleIssued({ code, recipientName }) })),
      setRevoked: vi.fn(async (code, revocation) =>
        ok({
          before: sampleIssued({ code }),
          after: sampleIssued({ code, revokedAt: revocation?.at ?? null, revokedReason: revocation?.reason ?? null }),
        }),
      ),
    },
    eligibility: {
      lookup: vi.fn(async ({ uid, email }) =>
        ok({
          candidate: {
            uid,
            email,
            hasParticipant: true,
            hasTicketHolder: true,
            ticketType: "pro" as const,
            attendedAt: NOW,
            isSpeaker: false,
            editionTeamRole: null,
          },
          ticketHolderName: "Sebastian Nicolás Fuentes Avalos",
          speakerName: null,
        }),
      ),
    },
    editions: {
      current: vi.fn(async () => ok({ id: "devfest-2026", name: "DevFest Tacna 2026", startsAt: null, endsAt: null })),
      getById: vi.fn(async (id) => ok({ id, name: "DevFest Tacna 2026", startsAt: null, endsAt: null })),
    },
    images: {
      ref: vi.fn((path, purpose) => (path.includes(`/${purpose}/`) ? { path, url: `/media/${path}` } : null)),
      remove: vi.fn(async () => {}),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    analytics: { track: vi.fn() },
    randomBytes: () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    now: () => NOW,
    ...overrides,
  };
}

describe("certificate use cases", () => {
  it("refuses publishing a new template without a background image and audits creation", async () => {
    const deps = makeDeps();
    const draft: CertificateTemplateDraft = {
      name: "Constancia",
      credentialTitle: "DevFest 2026",
      organizationName: "GDG Tacna",
      backgroundPath: null,
      width: DEFAULT_TEMPLATE_WIDTH,
      height: DEFAULT_TEMPLATE_HEIGHT,
      fields: defaultCertificateFields(),
      eligibility: defaultCertificateEligibility(),
      published: true,
    };

    expect(await createCertificateTemplate(deps, { uid: "a1", role: "admin" }, { id: "asistente", draft })).toEqual(err({ code: "missing-background" }));

    const created = await createCertificateTemplate(deps, { uid: "a1", role: "admin" }, { id: "asistente", draft: { ...draft, backgroundPath: BG_PATH } });
    expect(created.ok).toBe(true);
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "certificate.template.created", targetUid: "asistente" }));
  });

  it("refuses deleting a template that already has issued certificates", async () => {
    const deps = makeDeps();
    deps.certificates.countForTemplate = vi.fn(async () => ok(3));
    expect(await deleteCertificateTemplate(deps, { uid: "a1", role: "admin", canDelete: true }, "asistente")).toEqual(err({ code: "has-issued" }));

    deps.certificates.countForTemplate = vi.fn(async () => ok(0));
    const removed = await deleteCertificateTemplate(deps, { uid: "a1", role: "admin", canDelete: true }, "asistente");
    expect(removed).toEqual(ok({ name: "Constancia de participación" }));
    expect(deps.images.remove).toHaveBeenCalledWith(BG_PATH);
  });

  it("shows eligible claimable certificates with pre-filled name and issues idempotently", async () => {
    const deps = makeDeps();
    const overview = await getUserCertificatesOverview(deps, { uid: "u1", email: "sebastian@example.com", displayName: "Seba" });
    expect(overview.ok).toBe(true);
    if (overview.ok) {
      expect(overview.value.claimable).toHaveLength(1);
      expect(overview.value.claimable[0].suggestedName).toBe("Sebastian Nicolás Fuentes Avalos");
    }

    const claimed = await claimCertificate(
      deps,
      { uid: "u1", email: "sebastian@example.com", displayName: "Seba" },
      { eventId: "devfest-2026", templateId: "asistente", recipientName: "Sebastian Nicolás Fuentes Avalos" },
    );
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.value.code).toBe("GDG-23456-789AB");
      expect(claimed.value.recipientName).toBe("Sebastian Nicolás Fuentes Avalos");
    }
    expect(deps.analytics?.track).toHaveBeenCalledWith({
      name: "certificate_issued",
      uid: "u1",
      eventId: "devfest-2026",
      templateId: "asistente",
    });
  });

  it("blocks claiming when attendee ticket is ineligible (e.g. general when pro/premium required)", async () => {
    const deps = makeDeps({
      eligibility: {
        lookup: vi.fn(async ({ uid, email }) =>
          ok({
            candidate: { uid, email, hasParticipant: true, hasTicketHolder: true, ticketType: "general" as const, attendedAt: NOW, isSpeaker: false, editionTeamRole: null },
            ticketHolderName: "Ana General",
            speakerName: null,
          }),
        ),
      },
    });
    const claimed = await claimCertificate(
      deps,
      { uid: "u2", email: "ana@example.com", displayName: "Ana" },
      { eventId: "devfest-2026", templateId: "asistente", recipientName: "Ana Pérez" },
    );
    expect(claimed).toEqual(err({ code: "not-eligible" }));
  });

  it("verifies a public code without exposing private fields and supports admin rename/revoke/manual issue", async () => {
    const deps = makeDeps();
    const verified = await verifyCertificateByCode(deps, "gdg-23456-789ab");
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value?.recipientName).toBe("Sebastian Fuentes");
      expect(verified.value?.render?.backgroundUrl).toBe(BG_REF.url);
    }

    const renamed = await renameIssuedCertificate(deps, { uid: "a1", role: "admin" }, { code: "GDG-23456-789AB", recipientName: "Sebastián Fuentes Avalos" });
    expect(renamed.ok).toBe(true);
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "certificate.renamed", targetUid: "GDG-23456-789AB" }));

    const revoked = await revokeIssuedCertificate(deps, { uid: "a1", role: "admin" }, { code: "GDG-23456-789AB", reason: "Emitido por error" });
    expect(revoked.ok && revoked.value.revokedAt).toEqual(NOW);

    const manual = await issueManualCertificate(deps, { uid: "a1", role: "admin" }, { templateId: "asistente", recipientName: "Angelo Leva", recipientEmail: "angelo@gdg.dev" });
    expect(manual.ok && manual.value.uid).toBeNull();
  });
});
