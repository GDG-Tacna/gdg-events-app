"use server";

import { z } from "zod";
import { getSession } from "@/app-shell/guards";
import { attendeeDeps } from "@/app-shell/composition/attendee.server";
import type { RegisterAttendeeActionResult, RegisterAttendeeInput } from "@/features/attendee";
import { registerAttendee } from "@/features/attendee/server";

/** Hard cap before the domain rules run, so absurd payloads never reach them. */
const inputSchema = z.object({ alias: z.string().max(64) });

/**
 * Server Action behind the onboarding form. It is a public endpoint: the session is verified
 * here, input is validated, and only the alias is taken from the client. Role, XP, credits and
 * squad are decided by the use case.
 */
export async function registerAttendeeAction(input: RegisterAttendeeInput): Promise<RegisterAttendeeActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  // Staff and admin accounts are not onboarded as attendees.
  if (session.role !== null && session.role !== "attendee") return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "alias-invalid", alias: "too-long" };

  const result = await registerAttendee(attendeeDeps, { uid: session.uid, rawAlias: parsed.data.alias });
  if (!result.ok) {
    return { ok: false, code: result.error.code, alias: result.error.alias };
  }
  return { ok: true, created: result.value.created };
}
