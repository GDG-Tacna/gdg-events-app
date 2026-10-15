import type { ImageRef } from "@/features/media/constants";
import { EDITION } from "@/shared/config/edition";

/**
 * A step of the ladder as configured: a stable id, where it starts, and (when an admin named it) its name.
 * Without a name the rank shows its name from `shared/copy`, or "Nivel N".
 */
export interface RankDefinition {
  readonly id: string;
  readonly minXp: number;
  readonly name?: string;
  /** An uploaded icon shown next to the rank (on the cadet's card); absent when there is none. */
  readonly icon?: ImageRef | null;
}

export interface Rank extends RankDefinition {
  /** 1-based position in the ladder. Gates refer to levels, never to names. */
  readonly level: number;
}

export type RankId = string;
export type RankLadder = readonly Rank[];

/**
 * Builds a ladder from its definitions. It must start at 0 XP and rise strictly, or a rank could be
 * unreachable and the progress bar would divide by zero; an invalid ladder is a configuration bug and
 * fails loudly instead of showing wrong ranks.
 */
export function createRankLadder(definitions: readonly RankDefinition[]): RankLadder {
  if (definitions.length === 0) throw new Error("A rank ladder needs at least one rank");
  if (definitions[0].minXp !== 0) throw new Error("The first rank must start at 0 XP");

  const ids = new Set<string>();
  definitions.forEach((definition, index) => {
    if (!Number.isInteger(definition.minXp) || definition.minXp < 0) {
      throw new Error(`Rank "${definition.id}" needs a whole, non-negative XP threshold`);
    }
    if (index > 0 && definition.minXp <= definitions[index - 1].minXp) {
      throw new Error(`Rank "${definition.id}" must start above the previous rank`);
    }
    if (ids.has(definition.id)) throw new Error(`Duplicate rank id "${definition.id}"`);
    ids.add(definition.id);
  });

  return definitions.map((definition, index) => ({
    id: definition.id,
    minXp: definition.minXp,
    ...(definition.name !== undefined ? { name: definition.name } : {}),
    ...(definition.icon ? { icon: definition.icon } : {}),
    level: index + 1,
  }));
}

export const RANKS_MAX = 10;
export const RANK_XP_MAX = 100_000;
export const RANK_NAME_MIN = 2;
export const RANK_NAME_MAX = 30;
const RANK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;

export type RankProblem = "name" | "id" | "xp" | "first-not-zero" | "not-rising";

/**
 * What is wrong with each rank of a ladder being edited (by position), so the editor can point at it.
 * The same rules `parseRankLadder` applies on the server. A ladder with no ranks or too many is reported
 * under position -1.
 */
export function rankLadderProblems(input: ReadonlyArray<{ id: string; name: string; minXp: number }>): ReadonlyMap<number, readonly RankProblem[]> {
  const problems = new Map<number, RankProblem[]>();
  const add = (index: number, problem: RankProblem) => problems.set(index, [...(problems.get(index) ?? []), problem]);
  if (input.length === 0 || input.length > RANKS_MAX) add(-1, "not-rising");
  const ids = new Set<string>();
  input.forEach((rank, index) => {
    const name = rank.name.trim();
    if (name.length < RANK_NAME_MIN || name.length > RANK_NAME_MAX) add(index, "name");
    if (!RANK_ID_PATTERN.test(rank.id) || ids.has(rank.id)) add(index, "id");
    ids.add(rank.id);
    if (!Number.isInteger(rank.minXp) || rank.minXp < 0 || rank.minXp > RANK_XP_MAX) add(index, "xp");
    else if (index === 0 && rank.minXp !== 0) add(index, "first-not-zero");
    else if (index > 0 && rank.minXp <= input[index - 1].minXp) add(index, "not-rising");
  });
  return problems;
}

/**
 * Reads a ladder an admin saved: 1 to 10 ranks, each with a slug id, a name (2 to 30 characters) and a
 * whole XP threshold, the first at 0 and each above the previous. `null` when it breaks any rule, so a bad
 * document never reprices everyone with nonsense; the bundled ladder is used instead.
 */
export function parseRankLadder(input: unknown): RankLadder | null {
  if (!Array.isArray(input)) return null;
  const ranks = input.map((raw) => {
    const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof record.id === "string" ? record.id : "",
      name: typeof record.name === "string" ? record.name.trim().replace(/\s+/g, " ") : "",
      minXp: typeof record.minXp === "number" ? record.minXp : Number.NaN,
    };
  });
  if (rankLadderProblems(ranks).size > 0) return null;
  return createRankLadder(ranks);
}

/** The ladder of this edition. Functions below take another ladder when one is loaded from the database. */
export const RANKS: RankLadder = createRankLadder(EDITION.ranks);

/** Highest rank whose threshold the XP reaches. Negative or invalid XP counts as zero. */
export function rankFor(xp: number, ladder: RankLadder = RANKS): Rank {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let current: Rank = ladder[0];
  for (const rank of ladder) {
    if (safeXp >= rank.minXp) current = rank;
  }
  return current;
}

/** The next rank to reach, or null at the top. */
export function nextRank(xp: number, ladder: RankLadder = RANKS): Rank | null {
  const current = rankFor(xp, ladder);
  return ladder.find((rank) => rank.level === current.level + 1) ?? null;
}

export interface RankProgress {
  rank: Rank;
  /** The rank to reach next, or null at the top. */
  next: Rank | null;
  /** XP earned inside the current rank. */
  xpIntoRank: number;
  /** XP the current rank spans (next threshold minus this threshold), or null at the top. */
  xpSpan: number | null;
  /** 0 to 100, whole number. Always 100 at the top rank. */
  percent: number;
}

/** Where the XP stands between its rank and the next one: what a progress bar needs. */
export function rankProgress(xp: number, ladder: RankLadder = RANKS): RankProgress {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const rank = rankFor(safeXp, ladder);
  const next = nextRank(safeXp, ladder);
  const xpIntoRank = safeXp - rank.minXp;

  if (!next) return { rank, next, xpIntoRank, xpSpan: null, percent: 100 };

  const xpSpan = next.minXp - rank.minXp;
  return { rank, next, xpIntoRank, xpSpan, percent: Math.min(100, Math.floor((xpIntoRank / xpSpan) * 100)) };
}
