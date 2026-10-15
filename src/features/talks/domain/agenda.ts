import { err, ok, type Result } from "@/shared/lib/result";
import { compareTalks, type Talk } from "./talk";

/** Where a talk stands at the moment the agenda is read. */
export type AgendaStatus = "past" | "live" | "next" | "later";

export interface AgendaItem {
  id: string;
  title: string;
  speaker: string | null;
  /** ISO instants (plain data for the screen), `null` for a talk without a schedule. */
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  description: string;
  status: AgendaStatus;
  /** The cadet checked in to it (scanned its code in the room). */
  attended: boolean;
}

export interface AgendaDeps {
  /** The edition's talks (active or not); only the open ones make the agenda. */
  talks(): Promise<Result<readonly Talk[], { code: string }>>;
  /** The ids of the talks the cadet checked in to. */
  attendedTalkIds(uid: string): Promise<Result<ReadonlySet<string>, { code: string }>>;
  now: () => Date;
}

/**
 * The cadet's agenda: the edition's open talks in time order, each with where it stands right now (over, in
 * progress, the next one to start, or later) and whether the cadet attended it. Talks without a schedule go last
 * and are never "next". A closed talk is left out: its code no longer checks anyone in.
 */
export async function getAgenda(deps: AgendaDeps, uid: string): Promise<Result<readonly AgendaItem[], { code: "unknown" }>> {
  const [talks, attended] = await Promise.all([deps.talks(), deps.attendedTalkIds(uid)]);
  if (!talks.ok || !attended.ok) return err({ code: "unknown" });

  const now = deps.now().getTime();
  const open = talks.value.filter((talk) => talk.active).sort(compareTalks);
  const nextId = open.find((talk) => talk.startsAt !== null && talk.startsAt.getTime() > now)?.id ?? null;

  return ok(
    open.map((talk) => {
      const start = talk.startsAt?.getTime() ?? null;
      const end = talk.endsAt?.getTime() ?? null;
      const status: AgendaStatus =
        end !== null && end <= now ? "past" : start !== null && start <= now ? "live" : talk.id === nextId ? "next" : "later";
      return {
        id: talk.id,
        title: talk.title,
        speaker: talk.speaker,
        startsAt: talk.startsAt?.toISOString() ?? null,
        endsAt: talk.endsAt?.toISOString() ?? null,
        roomId: talk.roomId,
        description: talk.description,
        status,
        attended: attended.value.has(talk.id),
      };
    }),
  );
}
