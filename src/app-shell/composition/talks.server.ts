import "server-only";
import { galaxyDeps } from "@/app-shell/composition/quadrants.server";
import { FirestoreAuditLog } from "@/features/admin/server";
import { FirestoreCheckInCounter } from "@/features/checkins/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { FirestoreTalkStore, type AgendaDeps, type TalkAdminDeps } from "@/features/talks/server";
import { EDITION } from "@/shared/config/edition";
import { err, ok } from "@/shared/lib/result";
import { currentEditionOf } from "@/features/event/server";
import { ttlCached } from "@/shared/lib/ttl-cache";

/** The edition's talks, read and written over its checkpoints (kind `talk`). */
export const talkStore = new FirestoreTalkStore();

/**
 * The edition's quadrants as the rooms a talk can be in (read through the quadrants feature, so the talks feature
 * imports none of it).
 */
export async function talkRooms(): Promise<Array<{ id: string; name: string }>> {
  const galaxy = await getGalaxyMap(galaxyDeps);
  if (!galaxy.ok) throw new Error("Could not read the quadrants");
  return galaxy.value.quadrants.map(({ id, name }) => ({ id, name }));
}

/** Composition root for the admin "Charlas" screens. Times typed by the admin are the venue's (Peru, UTC-5). */
export const talkAdminDeps: TalkAdminDeps = {
  store: talkStore,
  directory: {
    roomIds: async () => {
      const galaxy = await getGalaxyMap(galaxyDeps);
      return galaxy.ok ? ok(new Set(galaxy.value.quadrants.map((quadrant) => quadrant.id))) : err({ code: "unknown" });
    },
  },
  audit: new FirestoreAuditLog(),
  now: () => new Date(),
  utcOffset: EDITION.utcOffset,
};

/**
 * The cadet's agenda: the talks kept for a minute (every cadet opening it would read them all again), the cadet's own
 * talk check-ins read each time (they change when the cadet scans).
 */
const checkIns = new FirestoreCheckInCounter();
const keptTalks = ttlCached(() => talkStore.list(), { key: currentEditionOf });

/** After an admin change: the agenda on this server instance shows it at once (others within a minute). */
export const refreshAgenda = () => keptTalks.clear();

export const agendaDeps: AgendaDeps = {
  talks: keptTalks,
  attendedTalkIds: async (uid) => {
    const ids = await checkIns.checkpointIdsOf(uid, "talk");
    return ids.ok ? ok(ids.value) : err({ code: ids.error.code });
  },
  now: () => new Date(),
};
