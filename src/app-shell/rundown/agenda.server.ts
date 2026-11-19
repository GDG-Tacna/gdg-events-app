import "server-only";
import { talkAdminDeps, talkSpeakers } from "@/app-shell/composition/talks.server";
import type { AgendaPoint } from "@/features/rundown";
import { compareTalks, listManagedTalks, toLocalDateTime } from "@/features/talks/server";
import { EDITION } from "@/shared/config/edition";

/**
 * The points of the agenda for the stage console: the edition's open talks in the order of the day, each with its start
 * time on the venue's clock and the names of its speakers. `null` when the talks cannot be read (the console then says so
 * instead of showing an empty agenda that is not real).
 */
export async function loadConsoleAgenda(actor: { uid: string; role: "attendee" | "staff" | "admin" | null }): Promise<AgendaPoint[] | null> {
  const [talks, speakers] = await Promise.all([listManagedTalks(talkAdminDeps, actor), talkSpeakers()]);
  if (!talks.ok) return null;
  const names = new Map(speakers.map((speaker) => [speaker.id, speaker.name] as const));
  return [...talks.value]
    .filter((talk) => talk.active)
    .sort(compareTalks)
    .map((talk) => {
      const named = talk.speakerIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
      return {
        id: talk.id,
        // `YYYY-MM-DDTHH:mm` on the venue's clock: the hour and minute are the part after the T.
        time: talk.startsAt ? toLocalDateTime(talk.startsAt, EDITION.utcOffset).slice(11, 16) : "",
        title: talk.title,
        who: named.length > 0 ? named.join(", ") : (talk.speaker ?? ""),
      };
    });
}
