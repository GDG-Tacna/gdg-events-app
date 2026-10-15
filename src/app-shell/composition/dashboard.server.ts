import "server-only";
import type { RankLadder } from "@/features/attendee";
import { getEditionLadder } from "@/features/attendee/server";
import type { AttendeeSource, WalletView } from "@/features/dashboard";
import { DEFAULT_MISSIONS } from "@/features/missions/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { currentEconomy, rewardLedger } from "./economy.server";
import { attendeeDeps } from "./attendee.server";
import { missionSource } from "./missions.server";
import { galaxyDeps } from "./quadrants.server";
import { rankDeps } from "./ranks.server";

/**
 * Composition root for the dashboard. It reads attendees through the same repository the attendee feature
 * owns, and ranks them with the edition's ladder, so the dashboard never talks to Firestore directly.
 */
export const dashboardDeps: { attendees: AttendeeSource; ranks: () => Promise<RankLadder>; wallet: (uid: string) => Promise<WalletView> } = {
  attendees: attendeeDeps.attendees,
  ranks: () => getEditionLadder(rankDeps),
  wallet: async (uid) => {
    const [economy, balance] = await Promise.all([currentEconomy(), rewardLedger.balanceOf(uid)]);
    return { creditsEnabled: economy.creditsEnabled, balance: balance.ok ? balance.value : null };
  },
};

/**
 * The open missions for the dashboard's missions card: the XP they give in all and the quadrants they are in (in the
 * plan's order). Read from the cached catalogs (missions, quadrants), so it costs no read per visit. `null` when a
 * catalog cannot be read: the card is decoration.
 */
export async function openMissionsSummary(): Promise<{ xp: number; quadrants: string[] } | null> {
  const [listed, galaxy] = await Promise.all([missionSource.list(), getGalaxyMap(galaxyDeps)]);
  if (!listed.ok || !galaxy.ok) return null;
  const missions = (listed.value.length > 0 ? listed.value : DEFAULT_MISSIONS).filter((mission) => mission.active);
  const withMissions = new Set(missions.map((mission) => mission.quadrantId));
  return {
    xp: missions.reduce((total, mission) => total + mission.xp, 0),
    quadrants: galaxy.value.quadrants.filter((quadrant) => withMissions.has(quadrant.id)).map((quadrant) => quadrant.name),
  };
}
