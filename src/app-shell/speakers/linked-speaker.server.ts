import "server-only";
import { cache } from "react";
import { keptSpeakerAccess } from "@/app-shell/composition/speakers.server";
import { moduleOn } from "@/app-shell/modules.server";
import { FEATURES } from "@/shared/config/features";
import { logServerError } from "@/shared/lib/log";

/** The active speaker of the request's edition linked to this account, or null (read once per request, kept a minute). */
export const linkedSpeaker = cache(async (uid: string): Promise<{ id: string; name: string } | null> => {
  if (!FEATURES.checkins) return null;
  const rows = await keptSpeakerAccess();
  if (!rows.ok) {
    // A failed read must never lock a cadet out: they are treated as not being a speaker.
    logServerError("speakers.linked", new Error(rows.error.code));
    return null;
  }
  const row = rows.value.find((candidate) => candidate.accountUid === uid && candidate.active);
  return row ? { id: row.speakerId, name: row.name } : null;
});

/**
 * Where a speaker's account goes instead of a cadet screen, or null when it may stay. Speaking is not a role: the
 * account may also be a cadet. With «Speakers como cadetes» on (Eventos › Módulos) they play like anyone else, and
 * only an account with no cadet profile yet starts on its code; switched off, the code is all a speaker gets.
 */
export async function speakerDetour(session: { uid: string; role: string | null }): Promise<"code" | null> {
  if (session.role !== null && session.role !== "attendee") return null;
  if (!(await linkedSpeaker(session.uid))) return null;
  if (!(await moduleOn("speakerPlay"))) return "code";
  return session.role === null ? "code" : null;
}
