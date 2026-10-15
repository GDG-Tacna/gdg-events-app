"use server";

import { z } from "zod";
import { quadrantAdminDeps } from "@/app-shell/composition/quadrant-admin.server";
import { quadrantSource } from "@/app-shell/composition/quadrants.server";
import { getSession } from "@/app-shell/guards";
import type { QuadrantAdminActionResult, SaveVenueActionResult } from "@/features/quadrants";
import {
  createQuadrant,
  moveQuadrant,
  saveVenue,
  seedLayout,
  setQuadrantActive,
  updateQuadrant,
  type QuadrantAdminActor,
  type QuadrantAdminErrorCode,
  type VenueMap,
} from "@/features/quadrants/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

const quadrantSchema = z.object({ id: z.string().max(48), name: z.string().max(200), tagline: z.string().max(300), planet: z.string().max(20) });
const activeSchema = z.object({ id: z.string().max(48), active: z.boolean() });
const moveSchema = z.object({ id: z.string().max(48), to: z.number().int().min(0).max(999) });
/** Shape and size only; every rule of the plan is checked again by `parseVenueMap` in the use case. */
const venueSchema = z.object({
  width: z.number(),
  height: z.number(),
  areas: z
    .array(
      z.object({
        id: z.string().max(60),
        kind: z.string().max(20),
        label: z.string().max(120),
        quadrantId: z.string().max(48).nullable(),
        rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      }),
    )
    .max(80),
  backgroundPath: z.string().max(300).nullable().optional(),
});

/**
 * Server Actions behind the Mapa screens. They are public endpoints: the flags, the session and the input
 * shape are checked here, the actor comes from the verified session, and every use case checks the admin
 * role again. After any change the attendees' cached map is dropped so they see it at once.
 */
async function adminActor(): Promise<QuadrantAdminActor | { ok: false; code: QuadrantAdminErrorCode }> {
  if (!FEATURES.admin || !(await moduleOn("map"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "map"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const refused = (value: unknown): value is { ok: false; code: QuadrantAdminErrorCode } => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: QuadrantAdminErrorCode } }): QuadrantAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  quadrantSource.invalidate();
  return { ok: true };
}

export async function seedLayoutAction(): Promise<SaveVenueActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const result = await seedLayout(quadrantAdminDeps, actor);
  if (!result.ok) return { ok: false, code: result.error.code };
  quadrantSource.invalidate();
  return { ok: true, standQrs: result.value.standQrs, failedQrs: [] };
}

export async function createQuadrantAction(input: { id: string; name: string; tagline: string; planet: string }): Promise<QuadrantAdminActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = quadrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await createQuadrant(quadrantAdminDeps, actor, parsed.data));
}

export async function updateQuadrantAction(input: { id: string; name: string; tagline: string; planet: string }): Promise<QuadrantAdminActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = quadrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  return done(await updateQuadrant(quadrantAdminDeps, actor, parsed.data));
}

export async function setQuadrantActiveAction(input: { id: string; active: boolean }): Promise<QuadrantAdminActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setQuadrantActive(quadrantAdminDeps, actor, parsed.data));
}

export async function moveQuadrantAction(input: { id: string; to: number }): Promise<QuadrantAdminActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveQuadrant(quadrantAdminDeps, actor, parsed.data));
}

export async function saveVenueAction(venue: VenueMap & { backgroundPath?: string | null }): Promise<SaveVenueActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = venueSchema.safeParse(venue);
  if (!parsed.success) return { ok: false, code: "invalid-venue" };
  const result = await saveVenue(quadrantAdminDeps, actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  quadrantSource.invalidate();
  return { ok: true, standQrs: result.value.standQrs, failedQrs: result.value.failedQrs };
}
