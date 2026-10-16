"use server";

import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { speakerCodeDeps } from "@/app-shell/composition/speakers.server";
import { currentEconomy, rewardLedger } from "@/app-shell/composition/economy.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import type { RecordCheckInActionResult, ScanReward } from "@/features/checkins";
import { recordCheckIn } from "@/features/checkins/server";
import { rewardTalk } from "@/features/economy/server";
import { completeByCheckpoint, completeBySpeaker } from "@/features/missions/server";
import { isContactCode } from "@/features/network";
import { isSpeakerCode } from "@/features/speakers";
import { verifySpeakerCode } from "@/features/speakers/server";
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
  if (isSpeakerCode(parsed.data)) return meetSpeaker(session.uid, parsed.data);

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

/**
 * A speaker's code («Conoce al speaker»): not a check-in, so nothing is recorded but the missions it completes. It
 * goes through the same per-cadet limiter as check-ins, then the signature and expiry, then whether the speaker is
 * still offered. Scanning it again is safe: a completed mission is never paid twice.
 */
async function meetSpeaker(uid: string, payload: string): Promise<RecordCheckInActionResult> {
  if (!(await checkInDeps.limiter.consume(uid))) return { ok: false, code: "rate-limited" };
  const verified = verifySpeakerCode(speakerCodeDeps, payload);
  if (!verified.ok) return { ok: false, code: verified.code };
  const found = await speakerCodeDeps.speakers.find(verified.speakerId);
  if (!found.ok) return { ok: false, code: "unknown" };
  if (!found.value) return { ok: false, code: "invalid-code" };
  if (!found.value.active) return { ok: false, code: "speaker-inactive" };

  let missions: ScanReward[] = [];
  if (await moduleOn("missions")) {
    const completed = await completeBySpeaker(missionDeps, uid, verified.speakerId);
    if (!completed.ok && completed.error.code === "not-registered") return { ok: false, code: "not-registered" };
    if (completed.ok) missions = completed.value.map(({ title, xpEarned, creditsEarned, justCompleted }) => ({ title, xpEarned, creditsEarned, justCompleted }));
  }
  const achievements = await unlockAchievements(uid);
  return { ok: true, checkpointId: verified.speakerId, kind: "speaker", recorded: true, firstEntrance: false, missions, talkCredits: 0, achievements };
}
