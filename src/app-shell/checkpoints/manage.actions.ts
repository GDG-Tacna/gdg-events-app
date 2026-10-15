"use server";

import { z } from "zod";
import { checkpointAdminDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { getSession } from "@/app-shell/guards";
import type { ManageActionResult } from "@/features/checkpoints";
import { createCheckpoint, renameCheckpoint, setCheckpointActive, setFoodRequirements, type ManageActor } from "@/features/checkpoints/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const createSchema = z.object({ name: z.string().max(200), id: z.string().max(100), kind: z.string().max(20) });
const renameSchema = z.object({ id: z.string().max(100), name: z.string().max(200) });
const activeSchema = z.object({ id: z.string().max(100), active: z.boolean() });
const requirementsSchema = z.object({ id: z.string().max(100), minLevel: z.number().nullable(), minTalks: z.number().nullable() });

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

export async function createCheckpointAction(input: { name: string; id: string; kind: string }): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };

  const result = await createCheckpoint(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, checkpoint: result.value } : { ok: false, code: result.error.code };
}

export async function renameCheckpointAction(input: { id: string; name: string }): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };

  const result = await renameCheckpoint(checkpointAdminDeps, actor, parsed.data);
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

export async function setFoodRequirementsAction(input: { id: string; minLevel: number | null; minTalks: number | null }): Promise<ManageActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;

  const parsed = requirementsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-level" };

  const result = await setFoodRequirements(checkpointAdminDeps, actor, parsed.data);
  return result.ok ? { ok: true, checkpoint: result.value } : { ok: false, code: result.error.code };
}
