import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  parseAllowedEmails,
  suggestTemplateId,
  validateTemplateDraft,
  type CertificateTemplateDraft,
} from "./template";

const validDraft = (overrides: Partial<CertificateTemplateDraft> = {}): CertificateTemplateDraft => ({
  name: "Constancia de participación",
  credentialTitle: "DevFest Tacna 2026 - Participación",
  organizationName: "GDG Tacna",
  linkedinOrganizationId: "12345678",
  issueDateText: "22 de Noviembre del 2026",
  issueDate: "2026-11-22",
  width: DEFAULT_TEMPLATE_WIDTH,
  height: DEFAULT_TEMPLATE_HEIGHT,
  fields: defaultCertificateFields(),
  eligibility: defaultCertificateEligibility(),
  published: false,
  ...overrides,
});

describe("template validation", () => {
  it("suggests clean slug ids from Spanish names", () => {
    expect(suggestTemplateId("Constancia de Participación 2026!")).toBe("constancia-de-participacion-2026");
  });

  it("validates a well-formed draft and defaults ticket eligibility to pro and premium", () => {
    const result = validateTemplateDraft(validDraft());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eligibility.allowedTickets).toEqual(["pro", "premium"]);
      expect(result.value.linkedinOrganizationId).toBe("12345678");
      expect(result.value.issueDate?.toISOString().slice(0, 10)).toBe("2026-11-22");
    }
  });

  it("requires recipientName field to stay enabled and rejects invalid colors or LinkedIn org IDs", () => {
    const disabledName = defaultCertificateFields().map((field) => (field.kind === "recipientName" ? { ...field, enabled: false } : field));
    expect(validateTemplateDraft(validDraft({ fields: disabledName }))).toEqual({ ok: false, error: { code: "invalid-fields" } });

    const badColor = defaultCertificateFields().map((field, index) => (index === 0 ? { ...field, color: "red" } : field));
    expect(validateTemplateDraft(validDraft({ fields: badColor }))).toEqual({ ok: false, error: { code: "invalid-fields" } });

    expect(validateTemplateDraft(validDraft({ linkedinOrganizationId: "gdg-tacna" }))).toEqual({ ok: false, error: { code: "invalid-linkedin-org" } });
    expect(validateTemplateDraft(validDraft({ issueDate: "2026-02-30" }))).toEqual({ ok: false, error: { code: "invalid-date" } });
  });

  it("parses and deduplicates pasted emails cleanly", () => {
    const parsed = parseAllowedEmails("Ana@Test.com, luis@test.com\nana@test.com; invalid-email");
    expect(parsed.valid).toEqual(["ana@test.com", "luis@test.com"]);
    expect(parsed.invalid).toEqual(["invalid-email"]);
  });

  it("refuses manual mode when no emails, speakers or team roles are selected", () => {
    expect(
      validateTemplateDraft(
        validDraft({
          eligibility: { mode: "manual", allowedTickets: [], includeSpeakers: false, includeTeamRoles: [], allowedEmails: [], requireAttendance: false },
        }),
      ),
    ).toEqual({ ok: false, error: { code: "invalid-eligibility" } });
  });
});
