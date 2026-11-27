import type { TicketType } from "@/features/tickets";
import type { CertificateTeamRole, CertificateTemplate } from "./template";

/** What the server knows about one signed-in person in a given edition when evaluating certificate eligibility. */
export interface EligibilityCandidate {
  uid: string;
  email: string | null;
  /** True when the user created a cadet profile in `events/{eventId}/participants/{uid}`. */
  hasParticipant: boolean;
  /** True when the user's email appears in `events/{eventId}/ticketHolders/{email}`. */
  hasTicketHolder: boolean;
  /** Resolved ticket type (from `participants/{uid}` if present, otherwise from `ticketHolders/{email}`). */
  ticketType: TicketType | null;
  /** Entrance check-in timestamp from `participants/{uid}.attendedAt`, or `null` if never scanned in. */
  attendedAt: Date | null;
  /** True when linked to an active speaker in `events/{eventId}/speakers`. */
  isSpeaker: boolean;
  /** Role in `events/{eventId}/team/{uid}`, or `null`. */
  editionTeamRole: CertificateTeamRole | null;
}

export type EligibilityMatch =
  | { eligible: true; via: "email" | "speaker" | "team" | "ticket" | "all" }
  | { eligible: false; reason: "not-published" | "missing-background" | "attendance-required" | "not-eligible" };

/**
 * Pure policy deciding whether a person may claim a given certificate template.
 * Explicit allowances (manual email list, linked speakers, edition team roles) grant access directly
 * without requiring an attendee entrance check-in; attendee rules (`all`, `tickets`) optionally enforce `attendedAt`.
 */
export function evaluateEligibility(
  template: Pick<CertificateTemplate, "published" | "background" | "eligibility">,
  candidate: EligibilityCandidate,
): EligibilityMatch {
  if (!template.published) return { eligible: false, reason: "not-published" };
  if (!template.background) return { eligible: false, reason: "missing-background" };

  const { eligibility } = template;
  const email = candidate.email ? candidate.email.trim().toLowerCase() : null;

  if (email && eligibility.allowedEmails.includes(email)) {
    return { eligible: true, via: "email" };
  }
  if (eligibility.includeSpeakers && candidate.isSpeaker) {
    return { eligible: true, via: "speaker" };
  }
  if (candidate.editionTeamRole && eligibility.includeTeamRoles.includes(candidate.editionTeamRole)) {
    return { eligible: true, via: "team" };
  }

  if (eligibility.mode === "manual") {
    return { eligible: false, reason: "not-eligible" };
  }

  if (eligibility.mode === "all") {
    if (!candidate.hasParticipant && !candidate.hasTicketHolder) {
      return { eligible: false, reason: "not-eligible" };
    }
    if (eligibility.requireAttendance && candidate.attendedAt === null) {
      return { eligible: false, reason: "attendance-required" };
    }
    return { eligible: true, via: "all" };
  }

  // mode === "tickets"
  const resolvedTicket = candidate.ticketType;
  if (!resolvedTicket || !eligibility.allowedTickets.includes(resolvedTicket)) {
    return { eligible: false, reason: "not-eligible" };
  }
  if (eligibility.requireAttendance && candidate.attendedAt === null) {
    return { eligible: false, reason: "attendance-required" };
  }
  return { eligible: true, via: "ticket" };
}
