import { err, ok, type Result } from "@/shared/lib/result";

/**
 * The fleet ranking of one edition: cadets by the XP they earned in it, ties won by whoever reached that XP
 * first (then by alias, so the order is always the same); squads by the total XP of their members. A cadet
 * enters the ranking with their first XP. Places are never shared: the order is strict.
 */

/** One cadet as the ranking reads them. `reachedAt` is when they reached their current XP (`null` when unknown). */
export interface RankingEntry {
  uid: string;
  alias: string;
  squadId: string | null;
  xp: number;
  reachedAt: Date | null;
}

export interface RankingSource {
  /**
   * The best `limit` cadets with XP, in ranking order. The source resolves ties at the edge itself, so the last
   * places are right even when many cadets share that XP.
   */
  top(limit: number): Promise<Result<readonly RankingEntry[], { code: string }>>;
  /** How many cadets are ahead of this one, and their XP; `null` when they are not registered in this edition. */
  placeOf(uid: string): Promise<Result<{ xp: number; ahead: number } | null, { code: string }>>;
  /** Every cadet registered in this edition. */
  total(): Promise<Result<number, { code: string }>>;
  /** Each squad's members and their total XP, for the squads asked. */
  squadTotals(squadIds: readonly string[]): Promise<Result<ReadonlyMap<string, { xp: number; members: number }>, { code: string }>>;
}

/** The squads of the edition (the squads feature answers it). */
export interface SquadDirectory {
  list(): Promise<Result<ReadonlyArray<{ id: string; name: string; active: boolean }>, { code: string }>>;
}

export interface LeaderboardDeps {
  ranking: RankingSource;
  squads: SquadDirectory;
}

export type LeaderboardErrorCode = "unknown";

/** Ranking order: more XP first; on a tie, whoever reached it first (unknown last), then alias. */
export function compareEntries(a: RankingEntry, b: RankingEntry): number {
  if (a.xp !== b.xp) return b.xp - a.xp;
  const at = a.reachedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.reachedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.alias.localeCompare(b.alias);
}

export const TOP_SIZE = 10;

export interface RankedCadet {
  position: number;
  alias: string;
  squad: string | null;
  xp: number;
  /** The cadet asking. */
  isMe: boolean;
}

export interface CadetStanding {
  /** The cadet's place, or `null` while they have no XP. */
  position: number | null;
  xp: number;
  /** Cadets registered in this edition. */
  total: number;
  top: readonly RankedCadet[];
}

async function squadNames(deps: Pick<LeaderboardDeps, "squads">): Promise<ReadonlyMap<string, string>> {
  // Names are decoration: without the catalog the ranking still stands, just without squad names.
  const listed = await deps.squads.list();
  return new Map(listed.ok ? listed.value.map((squad) => [squad.id, squad.name]) : []);
}

/** A cadet's place in the fleet and the top of the ranking, for the app. No uid ever leaves the server. */
export async function getCadetStanding(deps: LeaderboardDeps, uid: string): Promise<Result<CadetStanding, { code: LeaderboardErrorCode }>> {
  const [top, place, total, names] = await Promise.all([deps.ranking.top(TOP_SIZE), deps.ranking.placeOf(uid), deps.ranking.total(), squadNames(deps)]);
  if (!top.ok || !place.ok || !total.ok) return err({ code: "unknown" });
  const xp = place.value?.xp ?? 0;
  return ok({
    position: place.value && xp > 0 ? place.value.ahead + 1 : null,
    xp,
    total: total.value,
    top: top.value.map((entry, index) => ({
      position: index + 1,
      alias: entry.alias,
      squad: entry.squadId ? (names.get(entry.squadId) ?? null) : null,
      xp: entry.xp,
      isMe: entry.uid === uid,
    })),
  });
}

export interface SquadStanding {
  position: number;
  id: string;
  name: string;
  xp: number;
  members: number;
}

/**
 * The squads by their members' total XP. Active squads always appear; a retired one only while it still has
 * members (they keep it). Ties go to the squad with fewer members, then by name.
 */
export async function getSquadStandings(deps: LeaderboardDeps): Promise<Result<readonly SquadStanding[], { code: LeaderboardErrorCode }>> {
  const listed = await deps.squads.list();
  if (!listed.ok) return err({ code: "unknown" });
  const totals = await deps.ranking.squadTotals(listed.value.map((squad) => squad.id));
  if (!totals.ok) return err({ code: "unknown" });
  return ok(rankSquads(listed.value, totals.value));
}

/** The squads in ranking order from their totals (the rule `getSquadStandings` describes). */
export function rankSquads(
  squads: ReadonlyArray<{ id: string; name: string; active: boolean }>,
  totals: ReadonlyMap<string, { xp: number; members: number }>,
): SquadStanding[] {
  return squads
    .map((squad) => ({ id: squad.id, name: squad.name, active: squad.active, ...(totals.get(squad.id) ?? { xp: 0, members: 0 }) }))
    .filter((squad) => squad.active || squad.members > 0)
    .sort((a, b) => b.xp - a.xp || a.members - b.members || a.name.localeCompare(b.name))
    .map(({ id, name, xp, members }, index) => ({ position: index + 1, id, name, xp, members }));
}

/** A cadet on the stage: no uid, only what the big screen shows. */
export interface BoardCadet {
  position: number;
  alias: string;
  squad: string | null;
  xp: number;
}

/** What the stage shows: the top cadets and every squad. */
export interface FleetBoard {
  cadets: readonly BoardCadet[];
  squads: readonly SquadStanding[];
}

/** The fleet board as it stands now. */
export async function getFleetBoard(deps: LeaderboardDeps): Promise<Result<FleetBoard, { code: LeaderboardErrorCode }>> {
  const [top, squads, names] = await Promise.all([deps.ranking.top(TOP_SIZE), getSquadStandings(deps), squadNames(deps)]);
  if (!top.ok || !squads.ok) return err({ code: "unknown" });
  return ok({
    cadets: top.value.map((entry, index) => ({ position: index + 1, alias: entry.alias, squad: entry.squadId ? (names.get(entry.squadId) ?? null) : null, xp: entry.xp })),
    squads: squads.value,
  });
}

/** A participant document as the ranking reads it (XP 0 included), or `null` when it has no alias or no valid XP. */
export function participantEntry(uid: string, data: Record<string, unknown> | undefined): RankingEntry | null {
  if (!data || typeof data.alias !== "string" || typeof data.xp !== "number" || !Number.isFinite(data.xp) || data.xp < 0) return null;
  const raw = data.xpReachedAt as { toDate?: () => Date } | Date | undefined;
  const reachedAt = raw instanceof Date ? raw : raw && typeof raw.toDate === "function" ? raw.toDate() : null;
  return { uid, alias: data.alias, squadId: typeof data.squad === "string" && data.squad.length > 0 ? data.squad : null, xp: data.xp, reachedAt };
}

/**
 * The fleet board from every participant at once (the stage screen's live listener): the same rules as the server's
 * reads, computed in memory. Squad totals count every member, with or without XP.
 */
export function computeFleetBoard(entries: readonly RankingEntry[], squads: ReadonlyArray<{ id: string; name: string; active: boolean }>): FleetBoard {
  const names = new Map(squads.map((squad) => [squad.id, squad.name]));
  const totals = new Map<string, { xp: number; members: number }>();
  for (const entry of entries) {
    if (!entry.squadId) continue;
    const total = totals.get(entry.squadId) ?? { xp: 0, members: 0 };
    totals.set(entry.squadId, { xp: total.xp + entry.xp, members: total.members + 1 });
  }
  return {
    cadets: entries
      .filter((entry) => entry.xp > 0)
      .sort(compareEntries)
      .slice(0, TOP_SIZE)
      .map((entry, index) => ({ position: index + 1, alias: entry.alias, squad: entry.squadId ? (names.get(entry.squadId) ?? null) : null, xp: entry.xp })),
    squads: rankSquads(squads, totals),
  };
}
