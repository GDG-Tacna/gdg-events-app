import type { TicketsErrorCode } from "../domain/error";
import type { TicketHolder } from "../domain/ports";
import type { TicketType } from "../domain/ticket";

/** What the ticket actions answer. Plain data: it crosses the client boundary. */
export type TicketActionResult = { ok: true } | { ok: false; code: TicketsErrorCode };
export type ChangeCadetTicketAction = (input: { uid: string; type: TicketType }) => Promise<TicketActionResult>;

/** What importing the list answers: how many lines were stored and what it did to the cadets already registered. */
export type ImportTicketsActionResult =
  | { ok: true; total: number; applied: number; keptManual: number; failed: number; counts: Record<TicketType, number> }
  | { ok: false; code: TicketsErrorCode };
export type ImportTicketHoldersAction = (input: { rows: readonly TicketHolder[] }) => Promise<ImportTicketsActionResult>;

/** The cadet the staff scanned, as the staff screen shows them. */
export type LookupTicketActionResult = { ok: true; uid: string; alias: string; ticket: TicketType } | { ok: false; code: TicketsErrorCode };
export type LookupTicketAction = (input: { payload: string }) => Promise<LookupTicketActionResult>;

/** A cadet the staff found by name, email or alias: the email arrives masked. */
export interface TicketSearchHit {
  uid: string;
  alias: string;
  name: string | null;
  email: string | null;
  ticket: TicketType;
}
export type SearchTicketCadetsActionResult = { ok: true; cadets: readonly TicketSearchHit[] } | { ok: false; code: TicketsErrorCode };
export type SearchTicketCadetsAction = (input: { query: string }) => Promise<SearchTicketCadetsActionResult>;
