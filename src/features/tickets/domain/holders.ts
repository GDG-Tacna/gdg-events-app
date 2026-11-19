import { normalizeEmail } from "./email";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { ticketsError, type TicketsError } from "./error";
import type { ParticipantTicketStore, TicketAccounts, TicketAudit, TicketHolder, TicketHolderStore } from "./ports";
import { isTicketType, parseTicketType, ticketRank, type TicketType } from "./ticket";

/** The most lines one import takes (an edition sells a few hundred tickets). */
export const HOLDERS_MAX_ROWS = 2000;
export const HOLDER_NAME_MAX = 120;

/** A line that could not be read: its position in the pasted text and what is wrong with it. */
export interface InvalidHolderRow {
  /** 1-based, counted over the lines of the pasted text (the header is line 1). */
  line: number;
  reason: "email" | "type";
  /** The offending cell, for the admin to find it. */
  value: string;
}

/** An email that came more than once. When the tickets differ the highest one is kept (`conflict`). */
export interface DuplicateHolder {
  email: string;
  lines: number[];
  conflict: boolean;
  kept: TicketType;
}

export interface ParsedHolders {
  rows: TicketHolder[];
  invalid: InvalidHolderRow[];
  duplicates: DuplicateHolder[];
  counts: Record<TicketType, number>;
}

const EMAIL_HEADERS = ["correo", "email", "e-mail", "mail", "correo electronico"];
const NAME_HEADERS = ["nombre", "nombres", "nombre completo", "name", "asistente"];
const TYPE_HEADERS = ["tipo", "entrada", "tipo de entrada", "ticket", "type"];

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Tab (pasted from Excel) wins, then semicolon (Excel in Spanish), then comma. */
function detectSeparator(lines: readonly string[]): string {
  const sample = lines.find((line) => line.trim() !== "") ?? "";
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

/** Splits a line into cells; a cell in double quotes may hold the separator, and a doubled quote inside it is one quote. */
function splitLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at];
    if (quoted) {
      if (char === '"' && line[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/**
 * Reads the pasted or uploaded list: one holder per line with the columns correo, nombre and tipo (tipo is optional,
 * and an empty one means general). The separator is a tab, a semicolon or a comma, a leading byte order mark is
 * ignored and so is a header line. Emails are normalized; the same email twice keeps the highest ticket.
 */
export function parseHolderRows(text: string): ParsedHolders {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const separator = detectSeparator(lines);

  let emailAt = 0;
  let nameAt = 1;
  let typeAt = 2;
  let headerLine = -1;
  const firstFilled = lines.findIndex((line) => line.trim() !== "");
  if (firstFilled >= 0) {
    const header = splitLine(lines[firstFilled], separator).map(fold);
    const foundEmail = header.findIndex((cell) => EMAIL_HEADERS.includes(cell));
    if (foundEmail >= 0) {
      headerLine = firstFilled;
      emailAt = foundEmail;
      const foundName = header.findIndex((cell) => NAME_HEADERS.includes(cell));
      const foundType = header.findIndex((cell) => TYPE_HEADERS.includes(cell));
      nameAt = foundName >= 0 ? foundName : emailAt + 1;
      typeAt = foundType >= 0 ? foundType : emailAt + 2;
    }
  }

  const byEmail = new Map<string, { holder: TicketHolder; lines: number[]; conflict: boolean }>();
  const invalid: InvalidHolderRow[] = [];

  lines.forEach((raw, index) => {
    if (index === headerLine || raw.trim() === "") return;
    const line = index + 1;
    const cells = splitLine(raw, separator);
    const email = normalizeEmail(cells[emailAt] ?? "");
    if (email === null) {
      invalid.push({ line, reason: "email", value: cells[emailAt] ?? "" });
      return;
    }
    const type = parseTicketType(cells[typeAt] ?? "");
    if (type === null) {
      invalid.push({ line, reason: "type", value: cells[typeAt] ?? "" });
      return;
    }
    const fullName = (cells[nameAt] ?? "").replace(/\s+/g, " ").slice(0, HOLDER_NAME_MAX);
    const holder: TicketHolder = { email, fullName, type };

    const seen = byEmail.get(email);
    if (!seen) {
      byEmail.set(email, { holder, lines: [line], conflict: false });
      return;
    }
    seen.lines.push(line);
    if (seen.holder.type !== type) seen.conflict = true;
    if (ticketRank(type) > ticketRank(seen.holder.type)) seen.holder = { ...holder, fullName: holder.fullName || seen.holder.fullName };
    else if (seen.holder.fullName === "") seen.holder = { ...seen.holder, fullName: holder.fullName };
  });

  const rows = [...byEmail.values()].map((entry) => entry.holder);
  const duplicates = [...byEmail.values()]
    .filter((entry) => entry.lines.length > 1)
    .map((entry) => ({ email: entry.holder.email, lines: entry.lines, conflict: entry.conflict, kept: entry.holder.type }));
  return { rows, invalid, duplicates, counts: countHolders(rows) };
}

/** How many of the holders have each ticket. */
export function countHolders(rows: readonly { type: TicketType }[]): Record<TicketType, number> {
  const counts: Record<TicketType, number> = { general: 0, pro: 0, premium: 0 };
  for (const row of rows) counts[row.type] += 1;
  return counts;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface TicketsActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export interface ImportHoldersDeps {
  holders: TicketHolderStore;
  participants: ParticipantTicketStore;
  accounts: TicketAccounts;
  audit: TicketAudit;
  now: () => Date;
}

export interface ImportSummary {
  /** Lines stored in the list. */
  total: number;
  counts: Record<TicketType, number>;
  /** Registered cadets whose ticket this import set or changed. */
  applied: number;
  /** Registered cadets left as they are because someone set their ticket by hand. */
  keptManual: number;
  /** Lines whose account could not be looked up or whose cadet could not be updated: importing again retries them. */
  failed: number;
}

/** How many accounts are looked up at once. */
const LOOKUP_BATCH = 10;

/**
 * Stores the edition's list of ticket holders and applies it to the cadets who already registered (the ones who
 * register later get their ticket from the list when they do). A ticket that a person set by hand is never
 * overwritten by the list. Only an admin imports; the server action also checks the permission over Cadetes.
 */
export async function importTicketHolders(
  deps: ImportHoldersDeps,
  actor: TicketsActor,
  rows: readonly TicketHolder[],
): Promise<Result<ImportSummary, TicketsError>> {
  if (actor.role !== "admin") return err(ticketsError("forbidden"));
  if (rows.length === 0) return err(ticketsError("invalid-rows"));
  if (rows.length > HOLDERS_MAX_ROWS) return err(ticketsError("too-many-rows"));

  // The server does not trust what the browser parsed: it normalizes and validates again and keeps one line per email.
  const unique = new Map<string, TicketHolder>();
  for (const row of rows) {
    const email = normalizeEmail(typeof row.email === "string" ? row.email : "");
    if (email === null || !isTicketType(row.type) || typeof row.fullName !== "string") return err(ticketsError("invalid-rows"));
    const fullName = row.fullName.replace(/\s+/g, " ").trim().slice(0, HOLDER_NAME_MAX);
    const seen = unique.get(email);
    if (!seen || ticketRank(row.type) > ticketRank(seen.type)) unique.set(email, { email, fullName: fullName || seen?.fullName || "", type: row.type });
  }
  const holders = [...unique.values()];

  const stored = await deps.holders.upsertMany(holders);
  if (!stored.ok) return err(ticketsError("unknown"));

  const at = deps.now();
  let applied = 0;
  let keptManual = 0;
  let failed = 0;
  for (let from = 0; from < holders.length; from += LOOKUP_BATCH) {
    await Promise.all(
      holders.slice(from, from + LOOKUP_BATCH).map(async (holder) => {
        const account = await deps.accounts.findUidByEmail(holder.email);
        if (!account.ok) {
          failed += 1;
          return;
        }
        // Nobody has signed in with that email yet: they get the ticket when they register.
        if (account.value === null) return;
        const current = await deps.participants.get(account.value);
        if (!current.ok) {
          failed += 1;
          return;
        }
        // Signed in but not registered as a cadet: the registration reads the list.
        if (current.value === null) return;
        if (current.value.source === "manual") {
          keptManual += 1;
          return;
        }
        if (current.value.type === holder.type && current.value.source === "list") return;
        const written = await deps.participants.set(account.value, { type: holder.type, source: "list", by: null, at });
        if (!written.ok) failed += 1;
        else if (written.value !== null) applied += 1;
      }),
    );
  }

  const counts = countHolders(holders);
  const audited = await deps.audit.append({
    action: "tickets.imported",
    actorUid: actor.uid,
    targetUid: actor.uid,
    details: { total: String(holders.length), general: String(counts.general), pro: String(counts.pro), premium: String(counts.premium), applied: String(applied) },
    at,
  });
  // The list is already stored: a missing audit line must not undo it, but it must not go unnoticed.
  if (!audited.ok) logServerError("tickets.import.audit", new Error("audit entry missing for the ticket import"));
  return ok({ total: holders.length, counts, applied, keptManual, failed });
}

/** How many lines of the edition's list hold each ticket (the admin screen shows it next to the import). */
export async function summarizeTicketHolders(deps: Pick<ImportHoldersDeps, "holders">, actor: TicketsActor): Promise<Result<Record<TicketType, number>, TicketsError>> {
  if (actor.role !== "admin") return err(ticketsError("forbidden"));
  const counted = await deps.holders.countByType();
  return counted.ok ? ok(counted.value) : err(ticketsError("unknown"));
}
