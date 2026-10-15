import "server-only";
import { rankFor } from "@/features/attendee";
import { getEditionLadder } from "@/features/attendee/server";
import { FirestoreCheckInCounter } from "@/features/checkins/server";
import { FirestoreCheckpointStore, FoodGate } from "@/features/checkpoints/server";
import { rankName } from "@/shared/copy/rank-name";
import { attendeeDeps } from "./attendee.server";
import { rankDeps } from "./ranks.server";

const checkpoints = new FirestoreCheckpointStore();
const counter = new FirestoreCheckInCounter();

/**
 * The food gate of every meal, shared by the staff scanner and the attendee's own scan so both answer the
 * same. A person's level comes from their XP on the edition's ladder; their talks are their talk check-ins.
 */
export const foodGate = new FoodGate({
  requirements: (checkpointId) => checkpoints.requirementsOf(checkpointId),
  standing: async (uid) => {
    const [attendee, ladder, talks] = await Promise.all([attendeeDeps.attendees.findByUid(uid), getEditionLadder(rankDeps), counter.talksAttended(uid)]);
    if (!attendee.ok || !talks.ok) return { ok: false, error: { code: "unknown" } };
    // No profile: the use cases refuse that person before asking the gate, so this is level 1 with no talks.
    const xp = attendee.value?.xp ?? 0;
    return { ok: true, value: { level: rankFor(xp, ladder).level, talks: talks.value } };
  },
});

/**
 * What a person lacks, with the name the missing level has in the edition's ladder, for the staff verdict
 * and the attendee's scan. The name is decoration: a level the ladder does not have stays nameless.
 */
export async function describeShortfall(missing: { level: number | null; talks: number | null }): Promise<{ level: number | null; levelName: string | null; talks: number | null }> {
  if (missing.level === null) return { ...missing, levelName: null };
  const ladder = await getEditionLadder(rankDeps);
  const rank = ladder.find((candidate) => candidate.level === missing.level);
  return { ...missing, levelName: rank ? rankName(rank.id, rank.level, rank.name) : null };
}
