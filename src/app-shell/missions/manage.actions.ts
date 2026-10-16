"use server";

import { z } from "zod";
import { missionAdminDeps } from "@/app-shell/composition/mission-admin.server";
import { missionSource } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import type { MissionAdminActionResult } from "@/features/missions";
import {
  DEFAULT_MISSIONS,
  createMission,
  moveMission,
  seedMissions,
  setMissionActive,
  updateMission,
  type MissionAdminActor,
  type MissionAdminErrorCode,
  type MissionDraft,
} from "@/features/missions/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shape only; every rule (lengths, ranges, quadrant, checkpoint, speaker) is checked again by the use case. */
const configSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("talk"), checkpointId: z.string().max(60) }),
  z.object({ type: z.literal("stand"), checkpointId: z.string().max(60) }),
  z.object({ type: z.literal("speaker"), speakerId: z.string().max(60) }),
  z.object({ type: z.literal("quiz"), question: z.string().max(400), options: z.array(z.string().max(200)).max(6), answer: z.number().int() }),
  z.object({ type: z.literal("keyword"), prompt: z.string().max(400), keywords: z.array(z.string().max(80)).max(10) }),
]);
const saveSchema = z.object({
  id: z.string().max(60),
  draft: z.object({
    title: z.string().max(200),
    description: z.string().max(400),
    quadrantId: z.string().max(60),
    xp: z.number(),
    credits: z.number().nullable().optional(),
    minigame: z.string().max(60).nullable().optional(),
    minigameDifficulty: z.string().max(20).nullable().optional(),
    imagePath: z.string().max(300).nullable().optional(),
    config: configSchema,
  }),
});
const activeSchema = z.object({ id: z.string().max(60), active: z.boolean() });
const moveSchema = z.object({ id: z.string().max(60), to: z.number().int().min(0).max(999) });

/**
 * Server Actions behind the Misiones screens. They are public endpoints: the flags, the session and the
 * input shape are checked here, the actor comes from the verified session, and every use case checks the
 * admin role again. After any change the attendees' cached missions are dropped so they see it at once.
 */
async function adminActor(): Promise<MissionAdminActor | MissionAdminActionResult> {
  if (!FEATURES.admin || !(await moduleOn("missions"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "missions"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is MissionAdminActionResult => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: MissionAdminErrorCode } }): MissionAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  missionSource.invalidate();
  return { ok: true };
}

export async function seedMissionsAction(): Promise<MissionAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  return done(await seedMissions(missionAdminDeps, actor, DEFAULT_MISSIONS));
}

export async function createMissionAction(input: { id: string; draft: MissionDraft }): Promise<MissionAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-type" };
  return done(await createMission(missionAdminDeps, actor, parsed.data));
}

export async function updateMissionAction(input: { id: string; draft: MissionDraft }): Promise<MissionAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-type" };
  return done(await updateMission(missionAdminDeps, actor, parsed.data));
}

export async function setMissionActiveAction(input: { id: string; active: boolean }): Promise<MissionAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setMissionActive(missionAdminDeps, actor, parsed.data));
}

export async function moveMissionAction(input: { id: string; to: number }): Promise<MissionAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveMission(missionAdminDeps, actor, parsed.data));
}
