"use server";

import { z } from "zod";
import { refreshAgenda, talkAdminDeps } from "@/app-shell/composition/talks.server";
import { getSession } from "@/app-shell/guards";
import type { TalkAdminActionResult, TalkDraft } from "@/features/talks";
import { createTalk, setTalkActive, updateTalk, type TalkAdminActor, type TalkAdminErrorCode } from "@/features/talks/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const saveSchema = z.object({
  id: z.string().max(60),
  draft: z.object({
    title: z.string().max(200),
    speaker: z.string().max(200),
    startsAt: z.string().max(20),
    endsAt: z.string().max(20),
    roomId: z.string().max(60).nullable(),
    description: z.string().max(2000),
  }),
});
const activeSchema = z.object({ id: z.string().max(60), active: z.boolean() });

/**
 * Server Actions behind the Charlas screens. Public endpoints: the flags, the session and the input shape are
 * checked here, the actor comes from the verified session, and every use case checks the admin role again.
 */
async function adminActor(): Promise<TalkAdminActor | TalkAdminActionResult> {
  if (!FEATURES.admin || !FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "talks"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is TalkAdminActionResult => typeof value === "object" && value !== null && "ok" in value;
function done(result: { ok: true } | { ok: false; error: { code: TalkAdminErrorCode } }): TalkAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  refreshAgenda();
  return { ok: true };
}

export async function createTalkAction(input: { id: string; draft: TalkDraft }): Promise<TalkAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-title" };
  return done(await createTalk(talkAdminDeps, actor, parsed.data));
}

export async function updateTalkAction(input: { id: string; draft: TalkDraft }): Promise<TalkAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-title" };
  return done(await updateTalk(talkAdminDeps, actor, parsed.data));
}

export async function setTalkActiveAction(input: { id: string; active: boolean }): Promise<TalkAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setTalkActive(talkAdminDeps, actor, parsed.data));
}
