"use server";

import { z } from "zod";
import { copyDeps, editionModules, editionPermissions, editionsDeps, moduleDeps, permissionDeps } from "@/app-shell/composition/event.server";
import { dropEditionCaches } from "@/app-shell/composition/per-edition";
import { getSession } from "@/app-shell/guards";
import type { CopyEditionResult, EditionActionResult, EditionsErrorCode, SaveModulesResult, SavePermissionsResult } from "@/features/event";
import { copyEditionContent, createEdition, forgetPublicEdition, runInEdition, setEditionModules, setEditionPermissions, publishEdition, setEditionStatus, updateEdition, type EditionsActor } from "@/features/event/server";
import { FEATURES } from "@/shared/config/features";
import { isEventId } from "@/shared/types/event";
import { forgetCachedKey } from "@/shared/lib/ttl-cache";
import { mayEdit } from "@/app-shell/permissions.server";

const draftSchema = z.object({
  name: z.string().max(200),
  venue: z.string().max(200),
  startsAt: z.string().max(32),
  endsAt: z.string().max(32),
});
const saveSchema = z.object({ id: z.string().max(60), draft: draftSchema });
const statusSchema = z.object({ id: z.string().max(60), status: z.enum(["draft", "finished"]) });
const publishSchema = z.object({ id: z.string().max(60) });
const permissionsSchema = z.object({ eventId: z.string().max(60), organizer: z.record(z.string().max(30), z.string().max(10)), staffStations: z.array(z.string().max(20)).max(10) });
const modulesSchema = z.object({ eventId: z.string().max(60), off: z.array(z.string().max(30)).max(20) });
const copySchema = z.object({ from: z.string().max(60), to: z.string().max(60), parts: z.array(z.string().max(30)).max(20) });

/**
 * Server Actions behind the Eventos screen. Public endpoints: the flag, the session and the input shape are
 * checked here, the actor (with its admin scope) comes from the verified session, and every use case checks
 * the role and scope again.
 */
async function actor(): Promise<EditionsActor | EditionActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "event"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role, adminScope: session.adminScope ?? "edition", editionId: session.workingEdition };
}

const isResult = (value: unknown): value is EditionActionResult => typeof value === "object" && value !== null && "ok" in value;
const done = (result: { ok: true } | { ok: false; error: { code: EditionsErrorCode } }): EditionActionResult =>
  result.ok ? { ok: true } : { ok: false, code: result.error.code };

export async function createEditionAction(input: { id: string; draft: z.infer<typeof draftSchema> }): Promise<EditionActionResult> {
  const who = await actor();
  if (isResult(who)) return who;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await createEdition(editionsDeps, who, parsed.data));
}

export async function updateEditionAction(input: { id: string; draft: z.infer<typeof draftSchema> }): Promise<EditionActionResult> {
  const who = await actor();
  if (isResult(who)) return who;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await updateEdition(editionsDeps, who, parsed.data));
}

export async function setEditionStatusAction(input: { id: string; status: "draft" | "finished" }): Promise<EditionActionResult> {
  const who = await actor();
  if (isResult(who)) return who;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setEditionStatus(editionsDeps, who, parsed.data));
}

/** After publishing, this server forgets the cached public edition so its next request already serves the new one. */
export async function publishEditionAction(input: { id: string }): Promise<EditionActionResult> {
  const who = await actor();
  if (isResult(who)) return who;
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const result = await publishEdition(editionsDeps, who, parsed.data);
  if (result.ok) forgetPublicEdition();
  return done(result);
}

/**
 * Copies the chosen parts of one edition into another (only into parts still empty there). Afterwards this server
 * forgets what it kept of the destination, so its screens show the copy at once.
 */
export async function copyEditionAction(input: { from: string; to: string; parts: readonly string[] }): Promise<CopyEditionResult> {
  const who = await actor();
  // The session check only ever refuses with disabled, unauthenticated or forbidden.
  if (isResult(who)) return { ok: false, code: who.ok ? "unknown" : (who.code as "disabled" | "unauthenticated" | "forbidden") };
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-parts" };
  const copied = await copyEditionContent(copyDeps, who, parsed.data);
  if (!copied.ok) return { ok: false, code: copied.error.code, ...(copied.error.parts ? { parts: copied.error.parts } : {}) };
  dropEditionCaches(parsed.data.to);
  forgetCachedKey(parsed.data.to);
  return { ok: true, ...copied.value };
}

/**
 * Saves which modules an edition has off (only an admin of every edition). It works on the edition named, which may
 * not be the one the control center is on; afterwards this server forgets the switches it kept.
 */
export async function setEditionModulesAction(input: { eventId: string; off: readonly string[] }): Promise<SaveModulesResult> {
  const who = await actor();
  if (isResult(who)) return { ok: false, code: who.ok ? "unknown" : (who.code as "disabled" | "unauthenticated" | "forbidden") };
  const parsed = modulesSchema.safeParse(input);
  if (!parsed.success || !isEventId(parsed.data.eventId)) return { ok: false, code: "invalid-modules" };
  const { eventId, off } = parsed.data;
  const saved = await runInEdition(eventId, () => setEditionModules(moduleDeps, who, { off, eventId }));
  if (!saved.ok) return { ok: false, code: saved.error.code };
  editionModules.clear();
  return { ok: true };
}

/** Saves what organizers and staff may do in an edition (only an admin of every edition), inside that edition. */
export async function setEditionPermissionsAction(input: { eventId: string; organizer: Record<string, string>; staffStations: readonly string[] }): Promise<SavePermissionsResult> {
  const who = await actor();
  if (isResult(who)) return { ok: false, code: who.ok ? "unknown" : (who.code as "disabled" | "unauthenticated" | "forbidden") };
  const parsed = permissionsSchema.safeParse(input);
  if (!parsed.success || !isEventId(parsed.data.eventId)) return { ok: false, code: "invalid-permissions" };
  const { eventId, organizer, staffStations } = parsed.data;
  const saved = await runInEdition(eventId, () => setEditionPermissions(permissionDeps, who, { eventId, organizer, staffStations }));
  if (!saved.ok) return { ok: false, code: saved.error.code };
  editionPermissions.clear();
  return { ok: true };
}
