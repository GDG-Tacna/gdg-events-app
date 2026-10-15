"use server";

import { z } from "zod";
import { achievementAdminDeps, badgeSource } from "@/app-shell/composition/achievements.server";
import { getSession } from "@/app-shell/guards";
import type { AchievementAdminActionResult, BadgeDraft } from "@/features/achievements";
import {
  DEFAULT_BADGES,
  createBadge,
  moveBadge,
  seedBadges,
  setBadgeActive,
  updateBadge,
  type AchievementAdminActor,
  type AchievementAdminErrorCode,
} from "@/features/achievements/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

// Shapes only; every field and the rule's parameters are checked again by the use cases.
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

/**
 * Server Actions behind the Logros admin screens. Public endpoints: the flags, the session and the input
 * shape are checked here, the actor comes from the verified session, and every use case checks the admin
 * role again. After any change the cached badges are dropped so attendees see it at once.
 */
async function adminActor(): Promise<AchievementAdminActor | AchievementAdminActionResult> {
  if (!FEATURES.admin || !(await moduleOn("achievements"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "achievements"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}

const isResult = (value: unknown): value is AchievementAdminActionResult => typeof value === "object" && value !== null && "ok" in value;

function done(result: { ok: true } | { ok: false; error: { code: AchievementAdminErrorCode } }): AchievementAdminActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  badgeSource.invalidate();
  return { ok: true };
}

export async function seedBadgesAction(): Promise<AchievementAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  return done(await seedBadges(achievementAdminDeps, actor, DEFAULT_BADGES));
}

export async function createBadgeAction(input: { id: string; draft: BadgeDraft }): Promise<AchievementAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-rule" };
  return done(await createBadge(achievementAdminDeps, actor, parsed.data));
}

export async function updateBadgeAction(input: { id: string; draft: BadgeDraft }): Promise<AchievementAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-rule" };
  return done(await updateBadge(achievementAdminDeps, actor, parsed.data));
}

export async function setBadgeActiveAction(input: { id: string; active: boolean }): Promise<AchievementAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await setBadgeActive(achievementAdminDeps, actor, parsed.data));
}

export async function moveBadgeAction(input: { id: string; to: number }): Promise<AchievementAdminActionResult> {
  const actor = await adminActor();
  if (isResult(actor)) return actor;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return done(await moveBadge(achievementAdminDeps, actor, parsed.data));
}
