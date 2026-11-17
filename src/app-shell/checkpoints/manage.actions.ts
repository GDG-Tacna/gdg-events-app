"use server";

import { z } from "zod";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { mayDeleteItems } from "@/app-shell/deletion.server";
import { getSession } from "@/app-shell/guards";
import type { DeleteCheckpointActionResult, ManageActionResult } from "@/features/checkpoints";
import { DESCRIPTION_MAX_LENGTH, createCheckpoint, deleteCheckpoint, editCheckpoint, setCheckpointActive, type ManageActor } from "@/features/checkpoints/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const descriptionSchema = z.string().max(DESCRIPTION_MAX_LENGTH);
const imagePathSchema = z.string().max(300).nullable().optional();
const createSchema = z.object({ name: z.string().max(200), id: z.string().max(100), kind: z.string().max(20), description: descriptionSchema.optional(), imagePath: imagePathSchema });
const editSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: descriptionSchema,
  imagePath: imagePathSchema,
  kind: z.string().max(20).optional(),
  newId: z.string().max(100).optional(),
  requirements: z.object({ minLevel: z.number().nullable(), minTalks: z.number().nullable() }).optional(),
});
const activeSchema = z.object({ id: z.string().max(100), active: z.boolean() });

/**
 * Server Actions behind the Puestos screen. They are public endpoints: the flags, the session and the
 * input are checked here, the actor comes from the verified session, and every use case checks the admin
 * role again. Nothing is ever deleted: a checkpoint is closed, so its history stays.
 */
async function adminActor(): Promise<ManageActor | ManageActionResult> {
  if (!FEATURES.admin || !FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "checkpoints"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is ManageActionResult => typeof value === "object" && value !== null && "ok" in value;

export async function createCheckpointAction(input: { name: string; id: string; kind: string; description?: string; imagePath?: string | null }): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: parsed.error.issues.some((issue) => issue.path[0] === "description") ? "invalid-description" : "invalid-name" };

  const result = await createCheckpoint(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, checkpoint: result.value } : { ok: false, code: result.error.code };
}

/**
 * Saves the «Editar puesto» dialog: name, description, image and a meal's food gate always; a new kind or id only like
 * deleting (a draft edition, or an admin of every edition), and the use case refuses them when anything refers to the
 * puesto or it is a stand of the venue plan.
 */
export async function editCheckpointAction(input: {
  id: string;
  name: string;
  description: string;
  imagePath?: string | null;
  kind?: string;
  newId?: string;
  requirements?: { minLevel: number | null; minTalks: number | null };
}): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, code: field === "description" ? "invalid-description" : field === "requirements" ? "invalid-level" : field === "id" ? "not-found" : "invalid-name" };
  }
  // A published edition keeps what scans and reports refer to: changing the kind or id is gated like deleting.
  if (parsed.data.kind !== undefined || parsed.data.newId !== undefined) {
    const session = await getSession();
    if (!session || !(await mayDeleteItems(session))) return { ok: false, code: "edition-locked" };
  }

  const result = await editCheckpoint(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, checkpoint: result.value } : { ok: false, code: result.error.code };
}

export async function setCheckpointActiveAction(input: { id: string; active: boolean }): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };

  const result = await setCheckpointActive(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, checkpoint: result.value } : { ok: false, code: result.error.code };
}

export async function deleteCheckpointAction(input: { id: string }): Promise<DeleteCheckpointActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return { ok: false, code: actor.ok ? "unknown" : actor.code };

  const parsed = z.object({ id: z.string().max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  // A published edition keeps its stations: only an admin of every edition may delete there.
  const session = await getSession();
  if (!session || !(await mayDeleteItems(session))) return { ok: false, code: "edition-locked" };

  const result = await deleteCheckpoint(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, name: result.value.name } : { ok: false, code: result.error.code };
}
