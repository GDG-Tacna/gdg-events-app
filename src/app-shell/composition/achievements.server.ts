import "server-only";
import { FirestoreAuditLog } from "@/features/admin/server";
import {
  CachedBadgeSource,
  DEFAULT_BADGES,
  FirestoreAwardStore,
  FirestoreBadgeStore,
  syncAchievements,
  type AchievementAdminDeps,
  type AchievementDeps,
  type PlayerProgress,
} from "@/features/achievements/server";
import { rankFor } from "@/features/attendee";
import { getEditionLadder } from "@/features/attendee/server";
import { FirestoreCheckInCounter } from "@/features/checkins/server";
import { DEFAULT_MISSIONS, type Mission } from "@/features/missions/server";
import { countContacts } from "@/features/network/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { err, ok, type Result } from "@/shared/lib/result";
import { attendeeDeps } from "./attendee.server";
import { missionDeps, missionSource } from "./missions.server";
import { networkStore } from "./network.server";
import { recordImages } from "./media.server";
import { galaxyDeps } from "./quadrants.server";
import { rankDeps } from "./ranks.server";
import { perEdition } from "./per-edition";
import { moduleOn } from "@/app-shell/modules.server";

/** The edition's missions, or the bundled ones while it has none (the same rule the missions board follows). */
async function offeredMissions(): Promise<Result<readonly Mission[], { code: string }>> {
  const listed = await missionSource.list();
  if (!listed.ok) return listed;
  return ok(listed.value.length > 0 ? listed.value : DEFAULT_MISSIONS);
}

const counter = new FirestoreCheckInCounter();

/**
 * One attendee's progress in this edition, read through the features that own each part: completed
 * missions (missions), talks and stands (check-ins), level from XP on the edition's ladder and G-Credits
 * earned here (attendee), and contacts made (network).
 */
async function progressOf(uid: string): Promise<Result<PlayerProgress, { code: string }>> {
  const [completions, missions, talks, stands, attendee, ladder, contacts] = await Promise.all([
    missionDeps.completions.listFor(uid),
    offeredMissions(),
    counter.checkInsOf(uid, "talk"),
    counter.checkInsOf(uid, "stand"),
    attendeeDeps.attendees.findByUid(uid),
    getEditionLadder(rankDeps),
    countContacts({ contacts: networkStore }, uid),
  ]);
  if (!completions.ok || !missions.ok || !talks.ok || !stands.ok || !attendee.ok || !contacts.ok) return err({ code: "unknown" });

  const missionsByQuadrant = new Map<string, string[]>();
  for (const mission of missions.value) {
    if (!mission.active) continue;
    missionsByQuadrant.set(mission.quadrantId, [...(missionsByQuadrant.get(mission.quadrantId) ?? []), mission.id]);
  }
  return ok({
    completedMissionIds: new Set(completions.value.filter((completion) => completion.status === "completed").map((completion) => completion.missionId)),
    missionsByQuadrant,
    talks: talks.value,
    stands: stands.value,
    level: rankFor(attendee.value?.xp ?? 0, ladder).level,
    credits: attendee.value?.credits ?? 0,
    contacts: contacts.value,
  });
}

/** The edition's badges, kept for a minute. Admin changes invalidate it. */
export const badgeSource = perEdition(() => new CachedBadgeSource(new FirestoreBadgeStore()));

/** Composition root for earning badges: after check-ins and missions, and when the Logros tab opens. */
export const achievementDeps: AchievementDeps = {
  badges: badgeSource,
  defaults: DEFAULT_BADGES,
  awards: new FirestoreAwardStore(),
  progress: { progress: progressOf },
  now: () => new Date(),
};

/**
 * Awards whatever the attendee has just earned and answers with the new badges, for the scan or mission
 * result. Never fails the caller: with achievements off or a failed evaluation it answers none, and the
 * next scan, answer or visit to Logros awards them.
 */
export async function unlockAchievements(uid: string): Promise<ReadonlyArray<{ id: string; name: string; tone: string; imageUrl: string | null }>> {
  if (!(await moduleOn("achievements"))) return [];
  const synced = await syncAchievements(achievementDeps, uid);
  return synced.ok ? synced.value.unlocked.map(({ id, name, tone, image }) => ({ id, name, tone, imageUrl: image?.url ?? null })) : [];
}

/** Composition root for managing badges: quadrants from the galaxy map, missions from the missions feature. */
export const achievementAdminDeps: AchievementAdminDeps = {
  store: new FirestoreBadgeStore(),
  directory: {
    quadrantIds: async () => {
      const galaxy = await getGalaxyMap(galaxyDeps);
      return galaxy.ok ? ok(new Set(galaxy.value.quadrants.map((quadrant) => quadrant.id))) : err({ code: "unknown" });
    },
    missionIds: async () => {
      const missions = await offeredMissions();
      return missions.ok ? ok(new Set(missions.value.map((mission) => mission.id))) : err({ code: "unknown" });
    },
  },
  images: recordImages,
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
};
