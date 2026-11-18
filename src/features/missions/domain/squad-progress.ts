import type { SquadProgress } from "./ports";

/**
 * Which squads a cadet still has to meet for a «Conoce a alguien de cada escuadrón» mission.
 *
 * - `required` is every active squad except the cadet's own. A cadet with no squad has nothing to meet (the mission
 *   cannot be completed for them), and a retired squad is never asked for.
 * - `met` is the squad of each contact, ignoring contacts without a squad. It may include squads that are not
 *   required (the cadet's own, a retired one): only the required ones count.
 *
 * Pure: the app shell reads the squads, the cadet and their contacts, and hands them in.
 */
export function squadProgressOf(input: {
  ownSquad: string | null;
  squads: ReadonlyArray<{ id: string; active: boolean }>;
  contactSquads: ReadonlyArray<string | null>;
}): SquadProgress {
  const { ownSquad, squads, contactSquads } = input;
  const required = ownSquad === null ? [] : squads.filter((squad) => squad.active && squad.id !== ownSquad).map((squad) => squad.id);
  const met = [...new Set(contactSquads.filter((squadId): squadId is string => squadId !== null))];
  return { met, required };
}
