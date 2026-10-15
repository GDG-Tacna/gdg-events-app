import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import { DEFAULT_MISSIONS, type Mission } from "@/features/missions/server";
import {
  CachedCommunicationSource,
  CachedStoryTitle,
  DEFAULT_COMMUNICATIONS,
  FirestoreCommunicationStore,
  type OdysseyAdminDeps,
  type OdysseyDeps,
  type StoryAdminDeps,
} from "@/features/odyssey/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { err, ok, type Result } from "@/shared/lib/result";
import { missionDeps, missionSource } from "./missions.server";
import { galaxyDeps } from "./quadrants.server";
import { perEdition } from "./per-edition";

/** The edition's missions, or the bundled ones while it has none (the same rule the missions board follows). */
async function offeredMissions(): Promise<Result<readonly Mission[], { code: string }>> {
  const listed = await missionSource.list();
  if (!listed.ok) return listed;
  return ok(listed.value.length > 0 ? listed.value : DEFAULT_MISSIONS);
}

/** The edition's communications, kept for a minute. Admin changes invalidate it. */
export const communicationSource = perEdition(() => new CachedCommunicationSource(new FirestoreCommunicationStore()));

/** The title of the edition's story, kept for a minute. Saving it invalidates it. */
export const storyTitleSource = perEdition(() => new CachedStoryTitle(new FirestoreCommunicationStore()));

/** Composition root for the attendee's log: progress comes from the missions feature, bound here. */
export const odysseyDeps: OdysseyDeps = {
  source: communicationSource,
  defaults: DEFAULT_COMMUNICATIONS,
  progress: {
    completedIds: async (uid) => {
      const completions = await missionDeps.completions.listFor(uid);
      if (!completions.ok) return err({ code: "unknown" });
      return ok(new Set(completions.value.filter((completion) => completion.status === "completed").map((completion) => completion.missionId)));
    },
    titles: async () => {
      const missions = await offeredMissions();
      return missions.ok ? ok(new Map(missions.value.map((mission) => [mission.id, mission.title]))) : err({ code: "unknown" });
    },
  },
};

/** Composition root for managing communications: quadrants from the galaxy map, missions from the missions feature. */
export const odysseyAdminDeps: OdysseyAdminDeps = {
  store: new FirestoreCommunicationStore(),
  directory: {
    activeQuadrantIds: async () => {
      const galaxy = await getGalaxyMap(galaxyDeps);
      return galaxy.ok ? ok(new Set(galaxy.value.quadrants.map((quadrant) => quadrant.id))) : err({ code: "unknown" });
    },
    missionIds: async () => {
      const missions = await offeredMissions();
      return missions.ok ? ok(new Set(missions.value.map((mission) => mission.id))) : err({ code: "unknown" });
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};

/** Composition root for naming the story. */
export const storyAdminDeps: StoryAdminDeps = {
  titles: new FirestoreCommunicationStore(),
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
