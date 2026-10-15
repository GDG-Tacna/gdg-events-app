"use server";

import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { currentEconomy, rewardLedger } from "@/app-shell/composition/economy.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import type { RecordCheckInActionResult, ScanReward } from "@/features/checkins";
import { recordCheckIn } from "@/features/checkins/server";
import { rewardTalk } from "@/features/economy/server";
import { completeByCheckpoint } from "@/features/missions/server";
import { isContactCode } from "@/features/network";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";

/** A QR payload is short text; anything longer is not one of ours. */
const payloadSchema = z.string().min(1).max(512);

/** Checkpoint kinds that can complete missions. */
const MISSION_KINDS: ReadonlySet<string> = new Set(["talk", "stand"]);

/**
 * Server Action behind the scanner. It is a public endpoint: the flag, the session and the input are
 * checked here, and the only thing taken from the client is what the camera read. An attendee cannot
 * choose which checkpoint they check in to without holding a valid code.
 *
 * After a check-in at a talk or a stand (new or repeated), the missions tied to that checkpoint are
 * completed and their XP and G-Credits granted through the ledger, and a talk pays its own G-Credits. That step never undoes or fails the check-in:
 * if it fails, scanning again retries it (both steps are idempotent).
 */
export async function recordCheckInAction(payload: string): Promise<RecordCheckInActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: "invalid-code" };
  // Another cadet's contact code: say where it is scanned instead of calling it invalid.
  if ((await moduleOn("network")) && isContactCode(parsed.data)) return { ok: false, code: "contact-code" };

  const result = await recordCheckIn(checkInDeps, { uid: session.uid, payload: parsed.data });
  if (!result.ok) return { ok: false, code: result.error.code };

  let missions: ScanReward[] = [];
  if ((await moduleOn("missions")) && MISSION_KINDS.has(result.value.kind)) {
    const completed = await completeByCheckpoint(missionDeps, session.uid, result.value.checkpointId);
    if (completed.ok) missions = completed.value.map(({ title, xpEarned, creditsEarned, justCompleted }) => ({ title, xpEarned, creditsEarned, justCompleted }));
  }

  // Attending a talk pays G-Credits once per talk (a repeated scan retries a reward that failed).
  let talkCredits = 0;
  if (result.value.kind === "talk") {
    const rewarded = await rewardTalk({ ledger: rewardLedger, settings: currentEconomy }, session.uid, result.value.checkpointId);
    talkCredits = rewarded.ok ? rewarded.value.credits : 0;
  }
  // Whatever this scan earned (a talk, a stand, its missions) may unlock badges; never fails the check-in.
  const achievements = await unlockAchievements(session.uid);
  return { ok: true, ...result.value, missions, talkCredits, achievements };
}
