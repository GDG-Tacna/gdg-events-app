"use server";

import { z } from "zod";
import { globalAchievementAdminDeps, globalBadgeSource } from "@/app-shell/composition/achievements.server";
import { getSession } from "@/app-shell/guards";
import type { AchievementAdminActionResult, GlobalBadgeDraft } from "@/features/achievements";
import {
  DEFAULT_GLOBAL_BADGES,
  createGlobalBadge,
  deleteGlobalBadge,
  moveGlobalBadge,
  seedGlobalBadges,
  setGlobalBadgeActive,
  updateGlobalBadge,
  type AchievementAdminErrorCode,
  type GlobalAchievementAdminActor,
} from "@/features/achievements/server";
import { FEATURES } from "@/shared/config/features";

const saveSchema = z.object({
  id: z.string().max(60),
  draft: z.object({
    name: z.string().max(200),
    description: z.string().max(1000),
    tone: z.string().max(20),
    rule: z.record(z.string(), z.union([z.string().max(60), z.number()])),
    imagePath: z.string().max(300).nullable().optional(),
  }),
});
const activeSchema = z.object({ id: z.string().max(60), active: z.boolean() });
const moveSchema = z.object({ id: z.string().max(60), to: z.number().int().min(0).max(999) });

/** Server Actions for managing global community badges (global admins only). */
async function globalAdminActor(): Promise<GlobalAchievementAdminActor | AchievementAdminActionResult> {
  if (!FEATURES.admin || !FEATURES.achievements) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || session.adminScope !== "global") return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role, adminScope: session.adminScope };
}

const isResult = (value: unknown): value is AchievementAdminActionResult => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: AchievementAdminErrorCode } }): AchievementAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  globalBadgeSource.invalidate();
  return { ok: true };
}

export async function seedGlobalBadgesAction(): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  return done(await seedGlobalBadges(globalAchievementAdminDeps, actor, DEFAULT_GLOBAL_BADGES));
}

export async function createGlobalBadgeAction(input: { id: string; draft: GlobalBadgeDraft }): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-rule" };
  return done(await createGlobalBadge(globalAchievementAdminDeps, actor, parsed.data));
}

export async function updateGlobalBadgeAction(input: { id: string; draft: GlobalBadgeDraft }): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-rule" };
  return done(await updateGlobalBadge(globalAchievementAdminDeps, actor, parsed.data));
}

export async function setGlobalBadgeActiveAction(input: { id: string; active: boolean }): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setGlobalBadgeActive(globalAchievementAdminDeps, actor, parsed.data));
}

export async function deleteGlobalBadgeAction(input: { id: string }): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  const parsed = z.object({ id: z.string().max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await deleteGlobalBadge(globalAchievementAdminDeps, actor, parsed.data));
}

export async function moveGlobalBadgeAction(input: { id: string; to: number }): Promise<AchievementAdminActionResult> {
  const actor = await globalAdminActor();
  if (isResult(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveGlobalBadge(globalAchievementAdminDeps, actor, parsed.data));
}
