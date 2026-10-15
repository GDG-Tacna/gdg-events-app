import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreMinigameStore, getMinigameSettings, type MinigameAdminDeps, type MinigameDeps } from "@/features/minigames/server";
import { DEFAULT_MISSIONS } from "@/features/missions/server";
import { err, ok } from "@/shared/lib/result";
import { currentEditionOf } from "@/features/event/server";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { rewardLedger } from "./economy.server";
import { missionDeps, missionSource } from "./missions.server";

const store = new FirestoreMinigameStore();
/** The settings kept for a minute, only for what screens show; a save on this instance drops them at once. */
const keptSettings = ttlCached(() => store.read(), { key: currentEditionOf });

/** The edition's mini-game settings, or the defaults (never fails). */
export function currentMinigameSettings() {
  return getMinigameSettings({ store });
}

/** Composition root for the admin "Mini-juegos" settings. */
export const minigameAdminDeps: MinigameAdminDeps = {
  store: {
    read: () => store.read(),
    save: async (settings) => {
      const saved = await store.save(settings);
      keptSettings.clear();
      return saved;
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/**
 * Composition root for playing: the mission and the attendee's completion come from the missions feature (the
 * edition's missions, or the bundled ones while it has none), the bonus goes through the reward ledger.
 */
export const minigameDeps: MinigameDeps = {
  plays: store,
  missions: {
    bonusInfo: async (uid, missionId) => {
      const [listed, completions] = await Promise.all([missionSource.list(), missionDeps.completions.listFor(uid)]);
      if (!listed.ok || !completions.ok) return err({ code: "unknown" });
      const missions = listed.value.length > 0 ? listed.value : DEFAULT_MISSIONS;
      const mission = missions.find((candidate) => candidate.id === missionId);
      if (!mission) return ok(null);
      const completion = completions.value.find((candidate) => candidate.missionId === missionId);
      return ok({
        minigame: mission.minigame,
        difficulty: mission.minigameDifficulty,
        active: mission.active,
        completed: completion?.status === "completed",
        xpEarned: completion?.status === "completed" ? completion.xpEarned : 0,
      });
    },
  },
  settings: currentMinigameSettings,
  ledger: rewardLedger,
  now: () => new Date(),
};

/** The games the edition has on (kept a minute, like everything screens show), to tag missions that offer one. */
export async function enabledMinigames(): Promise<ReadonlySet<string>> {
  const settings = await minigameViewDeps.settings();
  return new Set(Object.entries(settings.games).flatMap(([id, game]) => (game.enabled ? [id] : [])));
}

/**
 * For the screens that offer a game (mission detail, the game screen): the same, with the settings kept for a minute.
 * Starting a play and recording its result go through `minigameDeps`, which always reads them fresh.
 */
export const minigameViewDeps: MinigameDeps = {
  ...minigameDeps,
  settings: () => getMinigameSettings({ store: { read: keptSettings, save: (settings) => store.save(settings) } }),
};
