import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { BadgeStanding } from "./achievements";
import {
  globalRuleProgress,
  meetsGlobalRule,
  type GlobalBadge,
  type GlobalPlayerProgress,
} from "./global-badge";

export interface GlobalBadgeSource {
  list(): Promise<Result<readonly GlobalBadge[], { code: string }>>;
}

export interface GlobalAwardStore {
  awardsOf(uid: string): Promise<Result<ReadonlyMap<string, Date>, { code: string }>>;
  award(input: { uid: string; badgeId: string; at: Date }): Promise<Result<{ awarded: boolean }, { code: string }>>;
}

export interface GlobalProgressSource {
  progress(uid: string): Promise<Result<GlobalPlayerProgress, { code: string }>>;
}

export interface GlobalAchievementDeps {
  badges: GlobalBadgeSource;
  defaults: readonly GlobalBadge[];
  awards: GlobalAwardStore;
  progress: GlobalProgressSource;
  now: () => Date;
}

export interface GlobalBadgeStanding {
  badge: GlobalBadge;
  earnedAt: Date | null;
  current: number;
  target: number;
}

export interface GlobalAchievementsResult {
  badges: readonly GlobalBadgeStanding[];
  unlocked: readonly GlobalBadge[];
}

/** One edition's achievements shown in the user's cross-edition achievements history. */
export interface EditionAchievementsGroup {
  eventId: string;
  eventName: string;
  /** True only for the currently active edition while still running; false for finished or past editions. */
  isLive: boolean;
  /** Live edition includes earned and pending badges; finished/past editions include earned badges only. */
  badges: readonly BadgeStanding[];
}

const byOrder = (a: GlobalBadge, b: GlobalBadge) => a.order - b.order || a.name.localeCompare(b.name);

/** Active global community badges in order (defaults until a global admin seeds custom ones). */
export async function offeredGlobalBadges(
  deps: Pick<GlobalAchievementDeps, "badges" | "defaults">,
): Promise<Result<readonly GlobalBadge[], { code: "unknown" }>> {
  const listed = await deps.badges.list();
  if (!listed.ok) return err({ code: "unknown" });
  const badges = listed.value.length > 0 ? listed.value : deps.defaults;
  return ok(badges.filter((badge) => badge.active).sort(byOrder));
}

/**
 * Evaluates every active global community badge for one user, awards newly met ones idempotently
 * (never revoking past awards), and returns standings with progress.
 */
export async function syncGlobalAchievements(
  deps: GlobalAchievementDeps,
  uid: string,
): Promise<Result<GlobalAchievementsResult, { code: "unknown" }>> {
  const [badges, awards, progress] = await Promise.all([
    offeredGlobalBadges(deps),
    deps.awards.awardsOf(uid),
    deps.progress.progress(uid),
  ]);
  if (!badges.ok || !awards.ok || !progress.ok) return err({ code: "unknown" });

  const unlocked: GlobalBadge[] = [];
  const standings: GlobalBadgeStanding[] = [];
  for (const badge of badges.value) {
    const { current, target } = globalRuleProgress(badge.rule, progress.value);
    let earnedAt = awards.value.get(badge.id) ?? null;
    if (earnedAt === null && meetsGlobalRule(badge.rule, progress.value)) {
      const at = deps.now();
      const awarded = await deps.awards.award({ uid, badgeId: badge.id, at });
      if (!awarded.ok) {
        logServerError("achievements.global.award", new Error(`global award ${badge.id} for ${uid} failed`));
      } else {
        earnedAt = at;
        if (awarded.value.awarded) unlocked.push(badge);
      }
    }
    standings.push({ badge, earnedAt, current: Math.min(current, target), target });
  }
  return ok({ badges: standings, unlocked });
}
