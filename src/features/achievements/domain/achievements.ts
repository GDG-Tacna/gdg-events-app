import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { meetsRule, ruleProgress, type Badge, type PlayerProgress } from "./badge";

/** The edition's own badges, active or not (empty until the admin loads or creates them). */
export interface BadgeSource {
  list(): Promise<Result<readonly Badge[], { code: string }>>;
}

/** Who earned what: one award per attendee and badge (`{uid}_{badgeId}`), never removed. */
export interface AwardStore {
  awardsOf(uid: string): Promise<Result<ReadonlyMap<string, Date>, { code: string }>>;
  /** Creates the award unless it exists; `awarded: false` when it already did (a repeat changes nothing). */
  award(input: { uid: string; badgeId: string; at: Date }): Promise<Result<{ awarded: boolean }, { code: string }>>;
}

/** One attendee's progress in this edition (missions, check-ins, level and credits), read by the app shell. */
export interface ProgressSource {
  progress(uid: string): Promise<Result<PlayerProgress, { code: string }>>;
}

export interface AchievementDeps {
  badges: BadgeSource;
  /** Offered while the edition has no badges of its own. */
  defaults: readonly Badge[];
  awards: AwardStore;
  progress: ProgressSource;
  now: () => Date;
}

export interface BadgeStanding {
  badge: Badge;
  /** When it was earned, or `null` while it is still to earn. */
  earnedAt: Date | null;
  /** Progress towards it, `current` capped at `target`. */
  current: number;
  target: number;
}

export interface AchievementsResult {
  /** The active badges of the edition in order, each with the attendee's standing. */
  badges: readonly BadgeStanding[];
  /** Badges this call awarded (empty when nothing new was earned). */
  unlocked: readonly Badge[];
}

const byOrder = (a: Badge, b: Badge) => a.order - b.order || a.name.localeCompare(b.name);

/** The badges an edition offers: its own once it has any, the bundled ones before. Only active ones count. */
export async function offeredBadges(deps: Pick<AchievementDeps, "badges" | "defaults">): Promise<Result<readonly Badge[], { code: "unknown" }>> {
  const listed = await deps.badges.list();
  if (!listed.ok) return err({ code: "unknown" });
  const badges = listed.value.length > 0 ? listed.value : deps.defaults;
  return ok(badges.filter((badge) => badge.active).sort(byOrder));
}

/**
 * Evaluates every active badge for one attendee, awards the ones they now meet (once each, on the server),
 * and answers with their standing. Called after a check-in or a mission and when the Logros tab opens, so
 * a badge missed by one call is awarded by the next. Awards are never taken back, even if a badge changes.
 */
export async function syncAchievements(deps: AchievementDeps, uid: string): Promise<Result<AchievementsResult, { code: "unknown" }>> {
  const [badges, awards, progress] = await Promise.all([offeredBadges(deps), deps.awards.awardsOf(uid), deps.progress.progress(uid)]);
  if (!badges.ok || !awards.ok || !progress.ok) return err({ code: "unknown" });

  const unlocked: Badge[] = [];
  const standings: BadgeStanding[] = [];
  for (const badge of badges.value) {
    const { current, target } = ruleProgress(badge.rule, progress.value);
    let earnedAt = awards.value.get(badge.id) ?? null;
    if (earnedAt === null && meetsRule(badge.rule, progress.value)) {
      const at = deps.now();
      const awarded = await deps.awards.award({ uid, badgeId: badge.id, at });
      if (!awarded.ok) {
        // Not earned yet as far as the attendee sees; the next call tries again.
        logServerError("achievements.award", new Error(`award ${badge.id} for ${uid} failed`));
      } else {
        earnedAt = at;
        if (awarded.value.awarded) unlocked.push(badge);
      }
    }
    standings.push({ badge, earnedAt, current: Math.min(current, target), target });
  }
  return ok({ badges: standings, unlocked });
}
