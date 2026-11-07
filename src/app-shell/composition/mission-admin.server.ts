import "server-only";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { FirestoreBadgeStore } from "@/features/achievements/server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { MINIGAME_IDS } from "@/features/minigames/server";
import { FirestoreMissionStore, type MissionAdminDeps } from "@/features/missions/server";
import { FirestoreCommunicationStore } from "@/features/odyssey/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { err, ok } from "@/shared/lib/result";
import { recordImages } from "./media.server";
import { speakerStore } from "./speakers.server";

/**
 * Composition root for managing missions. The quadrants come from the galaxy map, the checkpoint kinds from
 * the check-ins catalog, the speakers from their catalog, the mini-games from their catalog, and changes go to the admin audit trail; all bound here so the missions feature
 * imports none of those features. What still points at a mission (communications and badges) is read here too.
 */
export const missionAdminDeps: MissionAdminDeps = {
  store: new FirestoreMissionStore(),
  quadrants: {
    activeIds: async () => {
      const galaxy = await getGalaxyMap(galaxyDeps);
      return galaxy.ok ? ok(new Set(galaxy.value.quadrants.map((quadrant) => quadrant.id))) : err({ code: "unknown" });
    },
  },
  checkpoints: {
    kindOf: async (id) => {
      const found = await checkInDeps.catalog.find(id);
      return found.ok ? ok(found.value?.kind ?? null) : err({ code: "unknown" });
    },
  },
  speakers: {
    // Read fresh: a speaker added a moment ago must be choosable.
    activeIds: async () => {
      const listed = await speakerStore.list();
      return listed.ok ? ok(new Set(listed.value.filter((speaker) => speaker.active).map((speaker) => speaker.id))) : err({ code: "unknown" });
    },
  },
  minigames: { ids: MINIGAME_IDS },
  references: {
    // Read fresh (not the cached sources): a communication saved a moment ago must still stop the delete.
    to: async (missionId) => {
      const [communications, badges] = await Promise.all([new FirestoreCommunicationStore().list(), new FirestoreBadgeStore().list()]);
      if (!communications.ok || !badges.ok) return err({ code: "unknown" });
      return ok([
        ...communications.value.filter((communication) => communication.unlockMissionId === missionId).map((communication) => communication.title),
        ...badges.value.filter((badge) => badge.rule.type === "mission-completed" && badge.rule.missionId === missionId).map((badge) => badge.name),
      ]);
    },
  },
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
