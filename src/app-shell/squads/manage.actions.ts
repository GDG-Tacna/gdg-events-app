"use server";

import { z } from "zod";
import { squadAdminDeps } from "@/app-shell/composition/squad-admin.server";
import { squadCatalog } from "@/app-shell/composition/squads.server";
import { getSession } from "@/app-shell/guards";
import type { SquadAdminActionResult, SquadAdminErrorCode } from "@/features/squads";
import {
  STATIC_SQUADS,
  createSquad,
  moveSquad,
  reactivateSquad,
  retireSquad,
  seedSquads,
  updateSquad,
  type SquadAdminActor,
} from "@/features/squads/server";
import { FEATURES } from "@/shared/config/features";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

const logoSchema = z.object({
  rows: z.array(z.string().max(32)).max(32),
  palette: z.record(z.string().max(2), z.string().max(16)),
});
const squadSchema = z.object({
  id: z.string().max(48),
  name: z.string().max(200),
  tagline: z.string().max(300),
  sprite: logoSchema,
  logoPath: z.string().max(300).nullable().optional(),
});
/** What the form sends. Typed for the screens; its shape is checked again at runtime by `squadSchema`. */
type SquadInput = { id: string; name: string; tagline: string; sprite: PixelSpriteData; logoPath?: string | null };

const idSchema = z.object({ id: z.string().max(48) });
const moveSchema = z.object({ id: z.string().max(48), to: z.number().int().min(0).max(999) });

/**
 * Server Actions behind the Escuadrones screens. They are public endpoints: the flags, the session and
 * the input shape are checked here, the actor comes from the verified session, and every use case checks
 * the admin role again. After any change the attendees' cached catalog is dropped so they see it at once.
 */
async function adminActor(): Promise<SquadAdminActor | SquadAdminActionResult> {
  if (!FEATURES.admin || !(await moduleOn("squads"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "squads"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is SquadAdminActionResult => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: SquadAdminErrorCode } }): SquadAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  squadCatalog.invalidate();
  return { ok: true };
}

export async function seedSquadsAction(): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  return done(await seedSquads(squadAdminDeps, actor, STATIC_SQUADS));
}

export async function createSquadAction(input: SquadInput): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = squadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-logo" };
  return done(await createSquad(squadAdminDeps, actor, parsed.data));
}

export async function updateSquadAction(input: SquadInput): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = squadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-logo" };
  return done(await updateSquad(squadAdminDeps, actor, parsed.data));
}

export async function retireSquadAction(input: { id: string }): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await retireSquad(squadAdminDeps, actor, parsed.data));
}

export async function reactivateSquadAction(input: { id: string }): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await reactivateSquad(squadAdminDeps, actor, parsed.data));
}

export async function moveSquadAction(input: { id: string; to: number }): Promise<SquadAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveSquad(squadAdminDeps, actor, parsed.data));
}
