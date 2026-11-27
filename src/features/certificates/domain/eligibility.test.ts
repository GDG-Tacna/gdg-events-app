import { describe, expect, it } from "vitest";
import { evaluateEligibility, type EligibilityCandidate } from "./eligibility";
import { defaultCertificateEligibility } from "./template";

const BG = { path: "public/devfest-2026/certificate/abc12345.webp", url: "/media/public/devfest-2026/certificate/abc12345.webp" };

const baseCandidate = (overrides: Partial<EligibilityCandidate> = {}): EligibilityCandidate => ({
  uid: "u1",
  email: "ana@example.com",
  hasParticipant: true,
  hasTicketHolder: false,
  ticketType: "general",
  attendedAt: null,
  isSpeaker: false,
  editionTeamRole: null,
  ...overrides,
});

describe("evaluateEligibility", () => {
  it("refuses unpublished templates and templates without a background", () => {
    expect(
      evaluateEligibility({ published: false, background: BG, eligibility: defaultCertificateEligibility() }, baseCandidate({ ticketType: "pro" })),
    ).toEqual({ eligible: false, reason: "not-published" });
    expect(
      evaluateEligibility({ published: true, background: null, eligibility: defaultCertificateEligibility() }, baseCandidate({ ticketType: "pro" })),
    ).toEqual({ eligible: false, reason: "missing-background" });
  });

  it("enforces ticket types (e.g. only pro and premium) and supports email exceptions", () => {
    const eligibility = { ...defaultCertificateEligibility(), mode: "tickets" as const, allowedTickets: ["pro", "premium"] as const, allowedEmails: ["vip@example.com"] };
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ ticketType: "general" }))).toEqual({
      eligible: false,
      reason: "not-eligible",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ ticketType: "pro" }))).toEqual({
      eligible: true,
      via: "ticket",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ ticketType: "premium" }))).toEqual({
      eligible: true,
      via: "ticket",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ email: "VIP@example.com", ticketType: "general" }))).toEqual({
      eligible: true,
      via: "email",
    });
  });

  it("enforces optional attendance check-in for attendee rules, while bypassing it for speakers/team/allowlist", () => {
    const eligibility = {
      mode: "tickets" as const,
      allowedTickets: ["pro", "premium"] as const,
      includeSpeakers: true,
      includeTeamRoles: ["staff"] as const,
      allowedEmails: ["guest@example.com"],
      requireAttendance: true,
    };
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ ticketType: "pro", attendedAt: null }))).toEqual({
      eligible: false,
      reason: "attendance-required",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ ticketType: "pro", attendedAt: new Date() }))).toEqual({
      eligible: true,
      via: "ticket",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ isSpeaker: true, attendedAt: null }))).toEqual({
      eligible: true,
      via: "speaker",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ editionTeamRole: "staff", attendedAt: null }))).toEqual({
      eligible: true,
      via: "team",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility }, baseCandidate({ email: "guest@example.com", attendedAt: null }))).toEqual({
      eligible: true,
      via: "email",
    });
  });

  it("supports mode=all (including ticket holders who did not register an alias) and mode=manual", () => {
    const allRule = { ...defaultCertificateEligibility(), mode: "all" as const };
    expect(evaluateEligibility({ published: true, background: BG, eligibility: allRule }, baseCandidate({ hasParticipant: false, hasTicketHolder: true }))).toEqual({
      eligible: true,
      via: "all",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility: allRule }, baseCandidate({ hasParticipant: false, hasTicketHolder: false }))).toEqual({
      eligible: false,
      reason: "not-eligible",
    });

    const manualRule = { ...defaultCertificateEligibility(), mode: "manual" as const, includeSpeakers: true, allowedEmails: [] };
    expect(evaluateEligibility({ published: true, background: BG, eligibility: manualRule }, baseCandidate({ ticketType: "premium", isSpeaker: false }))).toEqual({
      eligible: false,
      reason: "not-eligible",
    });
    expect(evaluateEligibility({ published: true, background: BG, eligibility: manualRule }, baseCandidate({ isSpeaker: true }))).toEqual({
      eligible: true,
      via: "speaker",
    });
  });
});
