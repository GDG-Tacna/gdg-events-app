import { err, ok, type Result } from "@/shared/lib/result";

/** How one edition is going, for the admin's home. Every number is a count (an aggregation, never a full read). */
export interface EditionStats {
  eventId: string;
  /** Cadets with a profile in the edition. */
  registered: number;
  /** Cadets who came in (their first entrance was scanned). */
  attended: number;
  /** Talk check-ins in all. */
  talkCheckIns: number;
  /** Stand visits in all. */
  standVisits: number;
  /** Missions completed in all. */
  missionsCompleted: number;
  /** Contacts made in the Red. */
  contacts: number;
  /** How many cadets each squad has, in the squads' own order (every squad of the edition, empty ones too). */
  squads: ReadonlyArray<{ squadId: string; name: string; count: number }>;
  /** Cadets with no squad (or one the edition no longer lists). */
  withoutSquad: number;
  /** Each open meal with the rations handed out so far. */
  rations: ReadonlyArray<{ checkpointId: string; name: string; count: number }>;
}

/** An earlier edition, in short. */
export interface PastEdition {
  eventId: string;
  registered: number;
  attended: number;
}

export interface InsightsOverview {
  current: EditionStats;
  /** Earlier editions, newest id first. */
  past: readonly PastEdition[];
}

type Count = Promise<Result<number, { code: string }>>;

export interface StatsSource {
  /** Every edition with data, by id. */
  editions(): Promise<Result<readonly string[], { code: string }>>;
  registered(eventId: string): Count;
  attended(eventId: string): Count;
  checkInsOfKind(eventId: string, kind: "talk" | "stand"): Count;
  missionsCompleted(eventId: string): Count;
  contacts(eventId: string): Count;
  /** Cadets of the edition who belong to this squad. */
  squadMembers(eventId: string, squadId: string): Count;
  /** The edition's meals (catering checkpoints) with their rations. */
  rations(eventId: string): Promise<Result<ReadonlyArray<{ checkpointId: string; name: string; count: number }>, { code: string }>>;
}

export interface InsightsDeps {
  stats: StatsSource;
  /** The edition the app serves now. */
  currentEventId: () => Promise<string>;
  /** The edition's squads (the squads feature answers it, bound in the app shell), retired ones included. */
  squads: { list(): Promise<Result<ReadonlyArray<{ id: string; name: string }>, { code: string }>> };
}

export interface InsightsActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export type InsightsErrorCode = "forbidden" | "unknown";

/**
 * The admin's view of the event: the current edition in detail and each earlier one in short. Admin only. A failed
 * count fails the whole read (the home shows an error instead of a wrong number).
 */
export async function getInsights(deps: InsightsDeps, actor: InsightsActor): Promise<Result<InsightsOverview, { code: InsightsErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });

  const eventId = await deps.currentEventId();
  const squads = await deps.squads.list();
  if (!squads.ok) return err({ code: "unknown" });
  const [editions, registered, attended, talks, stands, missions, contacts, rations, members] = await Promise.all([
    deps.stats.editions(),
    deps.stats.registered(eventId),
    deps.stats.attended(eventId),
    deps.stats.checkInsOfKind(eventId, "talk"),
    deps.stats.checkInsOfKind(eventId, "stand"),
    deps.stats.missionsCompleted(eventId),
    deps.stats.contacts(eventId),
    deps.stats.rations(eventId),
    Promise.all(squads.value.map((squad) => deps.stats.squadMembers(eventId, squad.id))),
  ]);
  if (!editions.ok || !registered.ok || !attended.ok || !talks.ok || !stands.ok || !missions.ok || !contacts.ok || !rations.ok) return err({ code: "unknown" });
  const counts: number[] = [];
  for (const count of members) {
    if (!count.ok) return err({ code: "unknown" });
    counts.push(count.value);
  }
  const inSquads = counts.reduce((sum, count) => sum + count, 0);

  const pastIds = editions.value.filter((id) => id !== eventId).sort((a, b) => b.localeCompare(a));
  const past: PastEdition[] = [];
  for (const id of pastIds) {
    const [pastRegistered, pastAttended] = await Promise.all([deps.stats.registered(id), deps.stats.attended(id)]);
    if (!pastRegistered.ok || !pastAttended.ok) return err({ code: "unknown" });
    past.push({ eventId: id, registered: pastRegistered.value, attended: pastAttended.value });
  }

  return ok({
    current: {
      eventId,
      registered: registered.value,
      attended: attended.value,
      talkCheckIns: talks.value,
      standVisits: stands.value,
      missionsCompleted: missions.value,
      contacts: contacts.value,
      squads: squads.value.map((squad, index) => ({ squadId: squad.id, name: squad.name, count: counts[index] })),
      withoutSquad: Math.max(0, registered.value - inSquads),
      rations: [...rations.value].sort((a, b) => a.name.localeCompare(b.name, "es")),
    },
    past,
  });
}
