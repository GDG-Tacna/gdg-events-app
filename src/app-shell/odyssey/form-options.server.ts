import "server-only";
import { missionSource } from "@/app-shell/composition/missions.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { DEFAULT_MISSIONS } from "@/features/missions/server";
import { getGalaxyMap } from "@/features/quadrants/server";

export interface OdysseyFormOptions {
  quadrants: Array<{ id: string; name: string }>;
  missions: Array<{ id: string; name: string }>;
}

/**
 * What the Odisea screens offer: the edition's active quadrants and every mission it offers (its own, or the
 * bundled ones while it has none). Read here so the odyssey feature imports neither. Throws on a failed read.
 */
export async function loadOdysseyFormOptions(): Promise<OdysseyFormOptions> {
  const [galaxy, listed] = await Promise.all([getGalaxyMap(galaxyDeps), missionSource.list()]);
  if (!galaxy.ok) throw new Error("Could not read the quadrants");
  if (!listed.ok) throw new Error("Could not read the missions");
  const missions = listed.value.length > 0 ? listed.value : DEFAULT_MISSIONS;
  return {
    quadrants: galaxy.value.quadrants.map(({ id, name }) => ({ id, name })),
    missions: [...missions].sort((a, b) => a.order - b.order).map(({ id, title }) => ({ id, name: title })),
  };
}
