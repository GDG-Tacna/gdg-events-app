"use server";

import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { speakerCodeDeps } from "@/app-shell/composition/speakers.server";
import { teamCodeDeps } from "@/app-shell/composition/team-code.server";
import { currentEconomy, rewardLedger } from "@/app-shell/composition/economy.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import { connectContactAction } from "@/app-shell/network/network.actions";
import type { CheckInErrorCode, RecordCheckInActionResult, ScanReward } from "@/features/checkins";
import { recordCheckIn } from "@/features/checkins/server";
import { rewardTalk } from "@/features/economy/server";
import { completeByCheckpoint, completeBySpeaker, completeByTeam } from "@/features/missions/server";
import { isContactCode } from "@/features/network";
import { isPassCode } from "@/features/pass";
import { isSpeakerCode } from "@/features/speakers";
import { verifySpeakerCode } from "@/features/speakers/server";
import { isTeamCode } from "@/features/team-code";
import { verifyTeamCode } from "@/features/team-code/server";
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
  // Another cadet's contact code: the same scanner makes the contact (what the Red's own scanner does).
  if ((await moduleOn("network")) && isContactCode(parsed.data)) return connectContact(parsed.data);
  // A cadet's personal pass is for staff to scan: say so instead of calling it «not a DevFest code».
  if (isPassCode(parsed.data)) return { ok: false, code: "pass-code" };
  if (isSpeakerCode(parsed.data)) return meetSpeaker(session.uid, parsed.data);
  if (isTeamCode(parsed.data)) return meetTeam(session.uid, parsed.data);

  const result = await recordCheckIn(checkInDeps, { uid: session.uid, payload: parsed.data });
  if (!result.ok) return { ok: false, code: result.error.code };

  let missions: ScanReward[] = [];
  if ((await moduleOn("missions")) && MISSION_KINDS.has(result.value.kind)) {
    const completed = await completeByCheckpoint(missionDeps, session.uid, result.value.checkpointId);
    if (completed.ok) missions = completed.value.map(({ id, title, xpEarned, creditsEarned, justCompleted }) => ({ id, title, xpEarned, creditsEarned, justCompleted }));
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

/** The scanner's words for what the Red can refuse; the link errors cannot come from a scan. */
const CONTACT_ERRORS: Record<string, CheckInErrorCode> = {
  "invalid-code": "invalid-code",
  "expired-code": "expired-code",
  self: "own-contact-code",
  "unknown-cadet": "unknown-cadet",
  "not-registered": "not-registered",
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  disabled: "disabled",
};

/**
 * Another cadet's contact code: makes the two contacts through the Red's action (which checks the session, the code and
 * pays both) and answers in the scanner's shape. It is not a check-in, so it never counts for the key metric.
 */
async function connectContact(payload: string): Promise<RecordCheckInActionResult> {
  const connected = await connectContactAction(payload);
  if (!connected.ok) return { ok: false, code: CONTACT_ERRORS[connected.code] ?? "unknown" };
  const { card, created, xpEarned, creditsEarned, capReached, achievements, missions = [] } = connected;
  // `checkpointId` names no puesto here: a contact is between cadets.
  return {
    ok: true,
    checkpointId: "contact",
    kind: "contact",
    recorded: created,
    firstEntrance: false,
    contact: { card, created, xpEarned, creditsEarned, capReached },
    missions,
    achievements,
  };
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
  if (found.value.uid === uid) return { ok: false, code: "own-speaker-code" };

  let missions: ScanReward[] = [];
  if (await moduleOn("missions")) {
    const completed = await completeBySpeaker(missionDeps, uid, verified.speakerId);
    if (!completed.ok && completed.error.code === "not-registered") return { ok: false, code: "not-registered" };
    if (completed.ok) missions = completed.value.map(({ id, title, xpEarned, creditsEarned, justCompleted }) => ({ id, title, xpEarned, creditsEarned, justCompleted }));
  }
  const achievements = await unlockAchievements(uid);
  return { ok: true, checkpointId: verified.speakerId, kind: "speaker", recorded: true, firstEntrance: false, missions, talkCredits: 0, achievements };
}

/**
 * A team member's code («Conoce a un organizador / voluntario»): like a speaker's, not a check-in, so nothing is recorded
 * but the missions it completes. It goes through the same per-cadet limiter, then the signature and expiry (the role
 * it carries is signed). Scanning it again is safe: a completed mission is never paid twice.
 */
async function meetTeam(uid: string, payload: string): Promise<RecordCheckInActionResult> {
  if (!(await checkInDeps.limiter.consume(uid))) return { ok: false, code: "rate-limited" };
  const verified = verifyTeamCode(teamCodeDeps, payload);
  if (!verified.ok) return { ok: false, code: verified.code };

  let missions: ScanReward[] = [];
  if (await moduleOn("missions")) {
    // The code names who showed it (signed), so a mission that picks certain people can tell them apart.
    const completed = await completeByTeam(missionDeps, uid, { role: verified.role, memberUid: verified.uid });
    if (!completed.ok && completed.error.code === "not-registered") return { ok: false, code: "not-registered" };
    if (completed.ok) missions = completed.value.map(({ id, title, xpEarned, creditsEarned, justCompleted }) => ({ id, title, xpEarned, creditsEarned, justCompleted }));
  }
  const achievements = await unlockAchievements(uid);
  return { ok: true, checkpointId: verified.role, kind: "team", recorded: true, firstEntrance: false, missions, talkCredits: 0, achievements };
}
