import "server-only";
import { rankDeps } from "@/app-shell/composition/ranks.server";
import { loadOdysseyFormOptions } from "@/app-shell/odyssey/form-options.server";
import { getEditionLadder } from "@/features/attendee/server";
import { rankName } from "@/shared/copy/rank-name";

export interface AchievementFormOptions {
  quadrants: Array<{ id: string; name: string }>;
  missions: Array<{ id: string; name: string }>;
  levels: Array<{ level: number; name: string }>;
}

/**
 * What the Logros screens offer and name: the edition's active quadrants, every mission it offers and its
 * rank ladder. Read here so the achievements feature imports none of them. Throws on a failed read.
 */
export async function loadAchievementFormOptions(): Promise<AchievementFormOptions> {
  const [options, ladder] = await Promise.all([loadOdysseyFormOptions(), getEditionLadder(rankDeps)]);
  return { ...options, levels: ladder.map((rank) => ({ level: rank.level, name: rankName(rank.id, rank.level, rank.name) })) };
}

/** The same names as a lookup, for the list (a rule shows "Completa todas las misiones de IA"). */
export function ruleNamesOf(options: AchievementFormOptions) {
  return {
    quadrants: Object.fromEntries(options.quadrants.map((quadrant) => [quadrant.id, quadrant.name])),
    missions: Object.fromEntries(options.missions.map((mission) => [mission.id, mission.name])),
  };
}
