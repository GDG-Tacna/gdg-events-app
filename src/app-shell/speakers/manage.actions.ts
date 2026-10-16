"use server";

import { z } from "zod";
import { keptSpeakers, speakerAdminDeps } from "@/app-shell/composition/speakers.server";
import { getSession } from "@/app-shell/guards";
import { mayEdit } from "@/app-shell/permissions.server";
import type { SpeakerActionResult, SpeakerAdminErrorCode, SpeakerDraft } from "@/features/speakers";
import { createSpeaker, setSpeakerActive, updateSpeaker, type SpeakerAdminActor } from "@/features/speakers/server";
import { FEATURES } from "@/shared/config/features";

const draftSchema = z.object({
  name: z.string().max(200),
  headline: z.string().max(300),
  bio: z.string().max(2000),
  links: z.object({ linkedin: z.string().max(400), github: z.string().max(400), web: z.string().max(400) }),
});
const createSchema = z.object({ id: z.string().max(60), draft: draftSchema, photoPath: z.string().max(200).nullable().optional() });
const activeSchema = z.object({ id: z.string().max(60), active: z.boolean() });

/**
 * Server Actions behind the Speakers screen. Public endpoints: the flag, the session and the input shape are checked
 * here, the actor comes from the verified session, and every use case checks the admin role again. Speakers belong
 * to the talks section of an edition's permissions.
 */
async function adminActor(): Promise<SpeakerAdminActor | SpeakerActionResult> {
  if (!FEATURES.admin || !FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "talks"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is SpeakerActionResult => typeof value === "object" && value !== null && "ok" in value;
function done(result: { ok: true } | { ok: false; error: { code: SpeakerAdminErrorCode } }): SpeakerActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  keptSpeakers.clear();
  return { ok: true };
}

export async function createSpeakerAction(input: { id: string; draft: SpeakerDraft; photoPath?: string | null }): Promise<SpeakerActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await createSpeaker(speakerAdminDeps, actor, { ...parsed.data, photoPath: parsed.data.photoPath ?? null }));
}

export async function updateSpeakerAction(input: { id: string; draft: SpeakerDraft; photoPath?: string | null }): Promise<SpeakerActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await updateSpeaker(speakerAdminDeps, actor, parsed.data));
}

export async function setSpeakerActiveAction(input: { id: string; active: boolean }): Promise<SpeakerActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setSpeakerActive(speakerAdminDeps, actor, parsed.data));
}
