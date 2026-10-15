import type { AchievementAdminErrorCode, BadgeDraft } from "../domain/manage";

/** What the Logros admin actions answer. Plain data: it crosses the client boundary. */
export type AchievementAdminActionResult = { ok: true } | { ok: false; code: AchievementAdminErrorCode };
export type SeedBadgesAction = () => Promise<AchievementAdminActionResult>;
export type SaveBadgeAction = (input: { id: string; draft: BadgeDraft }) => Promise<AchievementAdminActionResult>;
export type SetBadgeActiveAction = (input: { id: string; active: boolean }) => Promise<AchievementAdminActionResult>;
export type MoveBadgeAction = (input: { id: string; to: number }) => Promise<AchievementAdminActionResult>;
