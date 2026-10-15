"use server";

import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { serveDeps } from "@/app-shell/composition/checkpoints.server";
import { describeShortfall } from "@/app-shell/composition/food-gate.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import { staffStations } from "@/app-shell/permissions.server";
import type { ServeActionResult, StationMission } from "@/features/checkpoints";
import { serveAttendee } from "@/features/checkpoints/server";
import { completeByCheckpoint } from "@/features/missions/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";

/** Short text only: a pass payload is about 110 characters. */
const inputSchema = z.object({ checkpointId: z.string().min(1).max(48), payload: z.string().min(1).max(512) });

/**
 * Server Action behind the staff scanner, at every station (entrance, catering, stand). It is a public
 * endpoint: the flag, the session and the input are checked here, the actor comes from the verified session
 * (staff or admin), and the use case checks the role again. The cadet is never named by the request: only a
 * genuine, live pass identifies one.
 *
 * After a stand scan (new or repeated) the stand's missions are completed for the cadet and paid through the
 * ledger, and any scan may unlock achievements: the same follow-ups the cadet's own scan had. They never undo
 * or fail the check-in; scanning again retries them (every step is idempotent).
 */
export async function serveAttendeeAction(input: { checkpointId: string; payload: string }): Promise<ServeActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "staff" && session.role !== "admin") return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-code" };

  // Staff operate only the kinds of station the edition gives them; admins operate every kind.
  const kinds = session.role === "staff" ? await staffStations() : undefined;
  const result = await serveAttendee(serveDeps, { uid: session.uid, role: session.role, kinds }, parsed.data);
  if (!result.ok) {
    return result.error.missing ? { ok: false, code: result.error.code, missing: await describeShortfall(result.error.missing) } : { ok: false, code: result.error.code };
  }

  const { uid, ...shown } = result.value;
  let missions: StationMission[] = [];
  if ((await moduleOn("missions")) && shown.kind === "stand") {
    const completed = await completeByCheckpoint(missionDeps, uid, parsed.data.checkpointId);
    if (completed.ok) missions = completed.value.map(({ title, xpEarned, justCompleted }) => ({ title, xpEarned, justCompleted }));
  }
  await unlockAchievements(uid);
  return { ok: true, ...shown, missions };
}
