import "server-only";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { currentEconomy } from "@/app-shell/composition/economy.server";
import { currentMinigameSettings } from "@/app-shell/composition/minigames.server";
import { speakerStore } from "@/app-shell/composition/speakers.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { listCheckpoints } from "@/features/checkpoints/server";
import { MINIGAME_IDS } from "@/features/minigames/server";
import type { AdminOption, MinigameOption } from "@/features/missions";
import { getGalaxyMap } from "@/features/quadrants/server";
import { compareSpeakers } from "@/features/speakers/server";
import { copy } from "@/shared/copy/es";
import { moduleOn } from "@/app-shell/modules.server";

export interface MissionFormOptions {
  quadrants: AdminOption[];
  checkpoints: { talk: AdminOption[]; stand: AdminOption[] };
  /** The edition's active speakers, for «Conoce al speaker» missions. */
  speakers: AdminOption[];
  /** G-Credits per mission type in this edition, or absent when credits are switched off. */
  creditDefaults?: Record<"talk" | "stand" | "speaker" | "quiz" | "keyword", number>;
  /** Every mini-game built, with whether the edition offers it and its difficulty; absent when mini-games are off. */
  minigames?: MinigameOption[];
}

/**
 * What the mission form offers: the edition's active quadrants, its open talk and stand checkpoints, its active
 * speakers, and the mini-games. Read from those features here, so the missions feature imports none of them. Throws
 * on a failed read so the route's error boundary shows a retry instead of an empty, misleading form.
 */
export async function loadMissionFormOptions(actor: { uid: string; role: "attendee" | "staff" | "admin" | null }): Promise<MissionFormOptions> {
  const [galaxy, checkpoints, speakers, economy, minigames] = await Promise.all([
    getGalaxyMap(galaxyDeps),
    listCheckpoints(checkpointAdminDeps, actor),
    speakerStore.list(),
    currentEconomy(),
    (await moduleOn("minigames")) ? currentMinigameSettings() : null,
  ]);
  if (!galaxy.ok) throw new Error("Could not read the quadrants");
  if (!checkpoints.ok) throw new Error("Could not read the checkpoints");
  if (!speakers.ok) throw new Error("Could not read the speakers");

  const open = checkpoints.value.filter((checkpoint) => checkpoint.active);
  const of = (kind: string) => open.filter((checkpoint) => checkpoint.kind === kind).map(({ id, name }) => ({ id, name }));
  return {
    quadrants: galaxy.value.quadrants.map(({ id, name }) => ({ id, name })),
    checkpoints: { talk: of("talk"), stand: of("stand") },
    speakers: [...speakers.value].filter((speaker) => speaker.active).sort(compareSpeakers).map(({ id, name }) => ({ id, name })),
    ...(economy.creditsEnabled ? { creditDefaults: { ...economy.missionCredits } } : {}),
    ...(minigames
      ? { minigames: MINIGAME_IDS.map((id) => ({ id, name: copy.minigames.names[id], enabled: minigames.games[id].enabled, difficulty: minigames.games[id].difficulty })) }
      : {}),
  };
}
