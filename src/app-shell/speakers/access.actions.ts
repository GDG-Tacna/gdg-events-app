"use server";

import { z } from "zod";
import { speakerAccessDeps } from "@/app-shell/composition/speakers.server";
import { getSession } from "@/app-shell/guards";
import { mayEdit } from "@/app-shell/permissions.server";
import { runInEdition } from "@/features/event/server";
import type { SpeakerAccessActionResult } from "@/features/speakers";
import { acceptSpeakerInvite, inviteSpeaker, splitSpeakerToken, unlinkSpeaker, type SpeakerAccessErrorCode } from "@/features/speakers/server";
import { FEATURES } from "@/shared/config/features";

const inviteSchema = z.object({ speakerId: z.string().max(60), email: z.string().max(254) });
const speakerSchema = z.object({ speakerId: z.string().max(60) });
const tokenSchema = z.object({ token: z.string().max(220) });

type Refusal = { ok: false; code: SpeakerAccessErrorCode };

/** The admin asking, from the verified session; giving speakers access belongs to the talks section. */
async function admin(): Promise<{ uid: string; role: "admin" } | Refusal> {
  if (!FEATURES.admin || !FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "talks"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const refused = (value: { uid: string } | Refusal): value is Refusal => "ok" in value;

/** Makes a speaker's invitation link for an email; answers its path (shown once). */
export async function inviteSpeakerAction(input: { speakerId: string; email: string }): Promise<{ ok: true; path: string } | Refusal> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-email" };
  const made = await inviteSpeaker(speakerAccessDeps, actor, parsed.data);
  return made.ok ? { ok: true, path: made.value.path } : { ok: false, code: made.error.code };
}

/** Takes a speaker's access away: their link stops working and their account no longer gets their code. */
export async function unlinkSpeakerAction(input: { speakerId: string }): Promise<SpeakerAccessActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = speakerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const done = await unlinkSpeaker(speakerAccessDeps, actor, parsed.data);
  return done.ok ? { ok: true } : { ok: false, code: done.error.code };
}

/**
 * Links the signed-in account to the speaker of a link (anyone signed in may try: the use case checks the link and
 * that the account's verified email is the invited one), in the edition the link names.
 */
export async function acceptSpeakerInviteAction(input: { token: string }): Promise<SpeakerAccessActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  const parsed = tokenSchema.safeParse(input);
  const link = parsed.success ? splitSpeakerToken(parsed.data.token) : null;
  if (!link) return { ok: false, code: "not-found" };
  const accepted = await runInEdition(link.eventId, () => acceptSpeakerInvite(speakerAccessDeps, { uid: session.uid, verifiedEmail: session.verifiedEmail ?? null }, link.secret));
  return accepted.ok ? { ok: true } : { ok: false, code: accepted.error.code };
}
