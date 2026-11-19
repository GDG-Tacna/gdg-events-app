import { normalizeEmail } from "./email";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { ticketsError, type TicketsError } from "./error";
import type { TicketsActor } from "./holders";
import type { ParticipantTicketStore, TicketAudit, TicketHolderStore } from "./ports";
import { DEFAULT_TICKET, isTicketType, type TicketSource, type TicketType } from "./ticket";

/** The ticket a new cadet starts with, and why. */
export interface ResolvedTicket {
  type: TicketType;
  source: Extract<TicketSource, "list" | "default">;
}

/**
 * The ticket for the email a person signed in with: the one on the edition's list or, when it is not there (or there
 * is no verified email, or the list could not be read), general by default. Registration never fails because of it:
 * the staff can fix a ticket, and importing the list again fixes the ones that were left on the default.
 */
export async function resolveTicketFor(deps: { holders: Pick<TicketHolderStore, "get"> }, email: string | null | undefined): Promise<ResolvedTicket> {
  const normalized = typeof email === "string" ? normalizeEmail(email) : null;
  if (normalized === null) return { type: DEFAULT_TICKET, source: "default" };
  const found = await deps.holders.get(normalized);
  if (!found.ok) {
    logServerError("tickets.resolve", new Error(found.error.code));
    return { type: DEFAULT_TICKET, source: "default" };
  }
  return found.value === null ? { type: DEFAULT_TICKET, source: "default" } : { type: found.value.type, source: "list" };
}

export interface ChangeTicketDeps {
  participants: ParticipantTicketStore;
  audit: TicketAudit;
  now: () => Date;
}

const isUid = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);

/**
 * Sets a cadet's ticket by hand, for example when they buy it on the day. Staff and admins may do it; the server
 * action checks what each of them may operate. The ticket is marked as set by hand (the list never overwrites it)
 * and, when it changed, the change is audited with who did it and as what.
 */
export async function changeCadetTicket(
  deps: ChangeTicketDeps,
  actor: TicketsActor,
  input: { uid: string; type: TicketType },
): Promise<Result<{ before: TicketType }, TicketsError>> {
  if (actor.role !== "staff" && actor.role !== "admin") return err(ticketsError("forbidden"));
  if (!isUid(input.uid)) return err(ticketsError("not-found"));
  if (!isTicketType(input.type)) return err(ticketsError("invalid-ticket"));

  const at = deps.now();
  const written = await deps.participants.set(input.uid, { type: input.type, source: "manual", by: actor.uid, at });
  if (!written.ok) return err(ticketsError("unknown"));
  if (written.value === null) return err(ticketsError("not-found"));

  if (written.value.before !== input.type) {
    const audited = await deps.audit.append({ action: "cadet.ticket", actorUid: actor.uid, targetUid: input.uid, details: { from: written.value.before, to: input.type, via: actor.role }, at });
    // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
    if (!audited.ok) logServerError("tickets.change.audit", new Error(`audit entry missing for ${input.uid}`));
  }
  return ok({ before: written.value.before });
}
