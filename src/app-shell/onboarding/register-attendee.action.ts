"use server";

import { z } from "zod";
import { getSession, teamPlayState } from "@/app-shell/guards";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import { ticketHolders } from "@/app-shell/composition/tickets.server";
import { moduleOn } from "@/app-shell/modules.server";
import { linkedSpeaker } from "@/app-shell/speakers/linked-speaker.server";
import type { RegisterAttendeeActionResult, RegisterAttendeeInput } from "@/features/attendee";
import { registerAttendee } from "@/features/attendee/server";
import { resolveTicketFor } from "@/features/tickets/server";

/** Hard cap before the domain rules run, so absurd payloads never reach them. */
const inputSchema = z.object({ alias: z.string().max(64) });

/**
 * Server Action behind the onboarding form. It is a public endpoint: the session is verified
 * here, input is validated, and only the alias is taken from the client. Role, XP, credits and
 * squad are decided by the use case, and the ticket comes from the edition's list of ticket holders by the
 * email the person signed in with (general when it is not there).
 */
export async function registerAttendeeAction(input: RegisterAttendeeInput): Promise<RegisterAttendeeActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  // A team account is onboarded as a cadet only where «Staff como cadetes» is on, and keeps its role.
  const isTeam = session.role !== null && session.role !== "attendee";
  if (isTeam && (await teamPlayState(session.role, session.uid)) === "off") return { ok: false, code: "forbidden" };
  // Where speakers may not play, a speaker's account only shows their code: it never becomes a cadet.
  if ((await linkedSpeaker(session.uid)) && !(await moduleOn("speakerPlay"))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "alias-invalid", alias: "too-long" };

  const ticket = await resolveTicketFor({ holders: ticketHolders }, session.verifiedEmail);
  const result = await registerAttendee(attendeeDeps, { uid: session.uid, rawAlias: parsed.data.alias, ticket, grantRole: !isTeam });
  if (!result.ok) {
    return { ok: false, code: result.error.code, alias: result.error.alias };
  }
  return { ok: true, created: result.value.created };
}
