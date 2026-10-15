"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { raffleDeps } from "@/app-shell/composition/raffle.server";
import { getSession } from "@/app-shell/guards";
import type { DrawRaffleActionResult, RaffleActionResult } from "@/features/raffle";
import { createRafflePrize, drawRafflePrize, saveRaffleSettings, updateRafflePrize, voidRaffleDraw, type RaffleActor } from "@/features/raffle/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shapes only; every rule (lengths, ranges, units left) is checked again by the use cases. */
const settingsSchema = z.object({ minCredits: z.number() });
const imagePath = z.string().max(300).nullable().optional();
const createSchema = z.object({ name: z.string().max(200), quantity: z.number(), imagePath });
const updateSchema = z.object({ id: z.string().min(1).max(100), name: z.string().max(200).optional(), quantity: z.number().optional(), active: z.boolean().optional(), imagePath });
const drawSchema = z.object({ prizeId: z.string().min(1).max(100) });
const voidSchema = z.object({ drawId: z.string().min(1).max(200) });

/**
 * Server Actions behind the "Sorteo" screen. Public endpoints: the flags, the session and the input shape are
 * checked here, the actor comes from the verified session, and every use case checks the admin role again.
 */
async function admin(): Promise<RaffleActor | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" }> {
  if (!FEATURES.admin || !(await moduleOn("raffle"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "raffle"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}
const refused = (value: RaffleActor | { ok: false }): value is { ok: false; code: "disabled" | "unauthenticated" | "forbidden" } => "ok" in value;

function refresh() {
  revalidatePath(ROUTES.adminRaffle);
  revalidatePath(ROUTES.adminStage);
  revalidatePath(ROUTES.dashboard);
}

export async function saveRaffleSettingsAction(input: { minCredits: number }): Promise<RaffleActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-settings" };
  const saved = await saveRaffleSettings(raffleDeps, actor, parsed.data);
  if (!saved.ok) return { ok: false, code: saved.error.code };
  refresh();
  return { ok: true };
}

export async function createRafflePrizeAction(input: { name: string; quantity: number; imagePath?: string | null }): Promise<RaffleActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  const created = await createRafflePrize(raffleDeps, actor, parsed.data);
  if (!created.ok) return { ok: false, code: created.error.code };
  refresh();
  return { ok: true };
}

export async function updateRafflePrizeAction(input: { id: string; name?: string; quantity?: number; active?: boolean }): Promise<RaffleActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const updated = await updateRafflePrize(raffleDeps, actor, parsed.data);
  if (!updated.ok) return { ok: false, code: updated.error.code };
  refresh();
  return { ok: true };
}

export async function drawRafflePrizeAction(input: { prizeId: string }): Promise<DrawRaffleActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = drawSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const drawn = await drawRafflePrize(raffleDeps, actor, parsed.data);
  if (!drawn.ok) return { ok: false, code: drawn.error.code };
  refresh();
  return { ok: true, winnerAlias: drawn.value.winnerAlias, tickets: drawn.value.tickets, totalTickets: drawn.value.totalTickets };
}

export async function voidRaffleDrawAction(input: { drawId: string }): Promise<RaffleActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const voided = await voidRaffleDraw(raffleDeps, actor, parsed.data);
  if (!voided.ok) return { ok: false, code: voided.error.code };
  refresh();
  return { ok: true };
}
