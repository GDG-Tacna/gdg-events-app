"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { squadCreditsDeps } from "@/app-shell/composition/economy.server";
import { getSession } from "@/app-shell/guards";
import type { SquadCreditsActionResult, SquadPrize } from "@/features/economy";
import { awardSquadBonus, createPrize, redeemPrize, setPrizeActive, updatePrize } from "@/features/economy/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { mayEdit } from "@/app-shell/permissions.server";

// Shapes only; ranges, lengths and ids are checked again by the use cases.
const bonusSchema = z.object({ squadId: z.string().max(80), amount: z.number(), reason: z.string().max(400), operationId: z.string().max(80) });
const redeemSchema = z.object({ squadId: z.string().max(80), prizeId: z.string().max(80), operationId: z.string().max(80) });
const prizeSchema = z.object({ id: z.string().max(80), name: z.string().max(400), description: z.string().max(1000), cost: z.number(), stock: z.number().nullable(), imagePath: z.string().max(300).nullable().optional() });
const activeSchema = z.object({ id: z.string().max(80), active: z.boolean() });

type Admin = { uid: string; role: "admin" };

/** Flag, session and admin role: a Server Action is a public endpoint, so each one checks them first. */
async function requireAdmin(): Promise<{ ok: true; actor: Admin } | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" }> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "squadCredits"))) return { ok: false, code: "forbidden" };
  return { ok: true, actor: { uid: session.uid, role: "admin" } };
}

/** Balances and prizes show on this screen and on every member's dashboard. */
function refresh() {
  revalidatePath(ROUTES.adminSquadCredits);
  revalidatePath(ROUTES.dashboard);
}

export async function awardSquadBonusAction(input: z.infer<typeof bonusSchema>): Promise<SquadCreditsActionResult<{ added: boolean; balance: number }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = bonusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-amount" };
  const result = await awardSquadBonus(squadCreditsDeps, admin.actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return { ok: true, value: result.value };
}

export async function redeemSquadPrizeAction(input: z.infer<typeof redeemSchema>): Promise<SquadCreditsActionResult<{ redeemed: boolean; balance: number }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const result = await redeemPrize(squadCreditsDeps, admin.actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return { ok: true, value: result.value };
}

export async function createSquadPrizeAction(input: z.infer<typeof prizeSchema>): Promise<SquadCreditsActionResult<SquadPrize>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = prizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  const result = await createPrize(squadCreditsDeps, admin.actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return { ok: true, value: result.value };
}

export async function updateSquadPrizeAction(input: z.infer<typeof prizeSchema>): Promise<SquadCreditsActionResult<SquadPrize>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = prizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-name" };
  const result = await updatePrize(squadCreditsDeps, admin.actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return { ok: true, value: result.value };
}

export async function setSquadPrizeActiveAction(input: z.infer<typeof activeSchema>): Promise<SquadCreditsActionResult<SquadPrize>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const result = await setPrizeActive(squadCreditsDeps, admin.actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  return { ok: true, value: result.value };
}
