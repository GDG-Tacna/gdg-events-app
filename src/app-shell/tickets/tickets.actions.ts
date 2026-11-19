"use server";

import { z } from "zod";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { ticketDeps } from "@/app-shell/composition/tickets.server";
import { getSession, type AppSession } from "@/app-shell/guards";
import { mayEdit, staffCheckpoints, staffStations } from "@/app-shell/permissions.server";
import { TICKET_TYPES, type ImportTicketsActionResult, type LookupTicketActionResult, type TicketActionResult, type TicketsErrorCode } from "@/features/tickets";
import { HOLDERS_MAX_ROWS, changeCadetTicket, importTicketHolders, type TicketsActor } from "@/features/tickets/server";
import { FEATURES } from "@/shared/config/features";

const uidSchema = z.string().min(1).max(128);
const changeSchema = z.object({ uid: uidSchema, type: z.enum(TICKET_TYPES) });
const lookupSchema = z.object({ payload: z.string().min(1).max(512) });
const importSchema = z.object({
  rows: z.array(z.object({ email: z.string().max(254), fullName: z.string().max(200), type: z.enum(TICKET_TYPES) })).min(1).max(HOLDERS_MAX_ROWS),
});

type Refused = { ok: false; code: TicketsErrorCode };
const refused = (value: unknown): value is Refused => typeof value === "object" && value !== null && "ok" in value;

/**
 * Who may change tickets: an admin who may edit the Cadetes section, or staff (and an admin) who operate a station of
 * the edition's team, as at the serving screens. The actor comes from the verified session, never from the request.
 */
async function staffOrAdminActor(session: AppSession): Promise<TicketsActor | Refused> {
  if (session.role === "admin") {
    if (!FEATURES.admin) return { ok: false, code: "disabled" };
    return (await mayEdit(session, "cadets")) ? { uid: session.uid, role: "admin" } : { ok: false, code: "forbidden" };
  }
  if (session.role === "staff") {
    if (!FEATURES.checkins) return { ok: false, code: "disabled" };
    // Staff need at least one station to operate: an account the organizer limited to none has no reason to be here.
    const kinds = await staffStations();
    const stations = await staffCheckpoints(session);
    if (kinds.length === 0 || (stations !== undefined && stations.length === 0)) return { ok: false, code: "forbidden" };
    return { uid: session.uid, role: "staff" };
  }
  return { ok: false, code: "forbidden" };
}

async function ticketActor(): Promise<TicketsActor | Refused> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  return staffOrAdminActor(session);
}

/** Sets a cadet's ticket by hand: Admin › Cadetes and the staff's «Cambiar entrada». Every change is audited. */
export async function changeCadetTicketAction(input: { uid: string; type: string }): Promise<TicketActionResult> {
  const actor = await ticketActor();
  if (refused(actor)) return actor;
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-ticket" };

  const result = await changeCadetTicket(ticketDeps, actor, parsed.data);
  return result.ok ? { ok: true } : { ok: false, code: result.error.code };
}

/**
 * The staff scanned a cadet's pass at «Cambiar entrada»: it answers who they are and their ticket. Only a genuine,
 * live pass identifies a cadet; the scan is rate limited like the serving scans.
 */
export async function lookupTicketAction(input: { payload: string }): Promise<LookupTicketActionResult> {
  const actor = await ticketActor();
  if (refused(actor)) return actor;
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-code" };

  if (!(await serveDeps.limiter.consume(actor.uid))) return { ok: false, code: "rate-limited" };
  const pass = await serveDeps.passes.verify(parsed.data.payload);
  if (!pass.ok) return { ok: false, code: pass.error.code };
  const attendee = await serveDeps.attendees.find(pass.value.uid);
  if (!attendee.ok) return { ok: false, code: "unknown" };
  if (attendee.value === null) return { ok: false, code: "attendee-not-found" };
  return { ok: true, uid: pass.value.uid, alias: attendee.value.alias, ticket: attendee.value.ticket };
}

/** Loads the edition's list of ticket holders (Admin › Cadetes › Entradas): only an admin who may edit Cadetes. */
export async function importTicketHoldersAction(input: { rows: readonly { email: string; fullName: string; type: string }[] }): Promise<ImportTicketsActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "cadets"))) return { ok: false, code: "forbidden" };

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: parsed.error.issues.some((issue) => issue.code === "too_big") ? "too-many-rows" : "invalid-rows" };

  const result = await importTicketHolders(ticketDeps, { uid: session.uid, role: "admin" }, parsed.data.rows);
  if (!result.ok) return { ok: false, code: result.error.code };
  const { total, applied, keptManual, failed, counts } = result.value;
  return { ok: true, total, applied, keptManual, failed, counts };
}
