"use server";

import { z } from "zod";
import { communicationSource, odysseyAdminDeps, storyAdminDeps, storyTitleSource } from "@/app-shell/composition/odyssey.server";
import { getSession } from "@/app-shell/guards";
import type { OdysseyAdminActionResult } from "@/features/odyssey";
import {
  DEFAULT_COMMUNICATIONS,
  createCommunication,
  moveCommunication,
  saveStoryTitle,
  seedCommunications,
  setCommunicationActive,
  updateCommunication,
  type CommunicationDraft,
  type OdysseyAdminActor,
  type OdysseyAdminErrorCode,
} from "@/features/odyssey/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

const saveSchema = z.object({
  id: z.string().max(60),
  draft: z.object({
    quadrantId: z.string().max(60),
    title: z.string().max(200),
    body: z.string().max(3000),
    unlockMissionId: z.string().max(60).nullable(),
  }),
});
const activeSchema = z.object({ id: z.string().max(60), active: z.boolean() });
const moveSchema = z.object({ id: z.string().max(60), to: z.number().int().min(0).max(999) });
const titleSchema = z.object({ title: z.string().max(200) });

/**
 * Server Actions behind the Historia screens. Public endpoints: the flags, the session and the input shape
 * are checked here, the actor comes from the verified session, and every use case checks the admin role
 * again. After any change the attendees' cached transmissions are dropped so they see it at once.
 */
async function adminActor(): Promise<OdysseyAdminActor | OdysseyAdminActionResult> {
  if (!FEATURES.admin || !(await moduleOn("odyssey"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "odyssey"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is OdysseyAdminActionResult => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: OdysseyAdminErrorCode } }): OdysseyAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  communicationSource.invalidate();
  return { ok: true };
}

export async function seedCommunicationsAction(): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  return done(await seedCommunications(odysseyAdminDeps, actor, DEFAULT_COMMUNICATIONS));
}

export async function createCommunicationAction(input: { id: string; draft: CommunicationDraft }): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-title" };
  return done(await createCommunication(odysseyAdminDeps, actor, parsed.data));
}

export async function updateCommunicationAction(input: { id: string; draft: CommunicationDraft }): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-title" };
  return done(await updateCommunication(odysseyAdminDeps, actor, parsed.data));
}

export async function setCommunicationActiveAction(input: { id: string; active: boolean }): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setCommunicationActive(odysseyAdminDeps, actor, parsed.data));
}

export async function moveCommunicationAction(input: { id: string; to: number }): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveCommunication(odysseyAdminDeps, actor, parsed.data));
}

export async function saveStoryTitleAction(input: { title: string }): Promise<OdysseyAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = titleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-story-title" };
  const saved = await saveStoryTitle(storyAdminDeps, actor, parsed.data);
  if (!saved.ok) return { ok: false, code: saved.error.code };
  storyTitleSource.invalidate();
  return { ok: true };
}
