import type { Result } from "@/shared/lib/result";
import type { TicketSource, TicketType } from "./ticket";

/** One line of an edition's list of ticket holders: who bought which ticket. Never a DNI nor a phone number. */
export interface TicketHolder {
  /** Normalized (trimmed, lowercase): the key of the line. */
  email: string;
  fullName: string;
  type: TicketType;
}

/** The edition's list of ticket holders, `events/{eventId}/ticketHolders`. */
export interface TicketHolderStore {
  /** `null` when the email is not on the list. */
  get(email: string): Promise<Result<TicketHolder | null, { code: string }>>;
  /** Inserts or replaces the lines by email. */
  upsertMany(holders: readonly TicketHolder[]): Promise<Result<void, { code: string }>>;
  /** How many lines of the list hold each ticket. */
  countByType(): Promise<Result<Record<TicketType, number>, { code: string }>>;
}

/** A cadet's ticket as their profile stores it. */
export interface ParticipantTicket {
  type: TicketType;
  source: TicketSource;
  /** The uid of whoever set it by hand, or `null`. */
  setBy: string | null;
  setAt: Date | null;
}

/** The ticket fields of the cadets' profiles (`events/{eventId}/participants/{uid}`). */
export interface ParticipantTicketStore {
  /** `null` when there is no such cadet in the edition. A profile without ticket fields reads as general by default. */
  get(uid: string): Promise<Result<ParticipantTicket | null, { code: string }>>;
  /** Writes the ticket fields only, in a transaction. Answers the ticket they had before, or `null` when there is no such cadet. */
  set(uid: string, ticket: { type: TicketType; source: TicketSource; by: string | null; at: Date }): Promise<Result<{ before: TicketType } | null, { code: string }>>;
}

/** The sign-in accounts, only to find a registered cadet by the email they signed in with. */
export interface TicketAccounts {
  /** `null` when nobody has signed in with that email. */
  findUidByEmail(email: string): Promise<Result<string | null, { code: string }>>;
}

export interface TicketAuditEntry {
  action: "cadet.ticket" | "tickets.imported";
  actorUid: string;
  /** The cadet whose ticket changed; the actor again for an import (it has no single target). */
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface TicketAudit {
  append(entry: TicketAuditEntry): Promise<Result<void, { code: string }>>;
}
