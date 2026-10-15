/**
 * Achievements: badges an attendee earns in one edition. Each badge has a rule from a closed set of types
 * that only the server evaluates; an admin picks a type and its parameters (a new type needs code). Stable
 * slug id; deactivated, never deleted.
 */
import type { ImageRef } from "@/features/media/constants";

export const BADGE_TONES = ["cyan", "lime", "gold", "magenta", "violet"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];

export const RULE_TYPES = ["missions-completed", "talks-attended", "stands-visited", "level-reached", "credits-earned", "quadrant-complete", "mission-completed", "contacts-made"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export type BadgeRule =
  | { type: "missions-completed"; count: number }
  | { type: "talks-attended"; count: number }
  | { type: "stands-visited"; count: number }
  | { type: "level-reached"; level: number }
  | { type: "credits-earned"; count: number }
  | { type: "quadrant-complete"; quadrantId: string }
  | { type: "mission-completed"; missionId: string }
  | { type: "contacts-made"; count: number };

export interface Badge {
  id: string;
  name: string;
  description: string;
  tone: BadgeTone;
  rule: BadgeRule;
  order: number;
  active: boolean;
  /** An uploaded image shown instead of the pixel medal (the medal and its tone stay as the fallback). */
  image: ImageRef | null;
}

/** What the rules look at: one attendee's progress in this edition. */
export interface PlayerProgress {
  completedMissionIds: ReadonlySet<string>;
  /** Active missions of each quadrant the edition offers (for "complete a quadrant"). */
  missionsByQuadrant: ReadonlyMap<string, readonly string[]>;
  talks: number;
  stands: number;
  level: number;
  /** G-Credits earned in this edition. */
  credits: number;
  /** Contacts made in the cadet network of this edition (phase 5). */
  contacts: number;
}

export const BADGE_NAME_MIN = 2;
export const BADGE_NAME_MAX = 40;
export const BADGE_DESCRIPTION_MIN = 3;
export const BADGE_DESCRIPTION_MAX = 160;
export const RULE_COUNT_MAX = 1000;
export const RULE_CREDITS_MAX = 100_000;
export const RULE_LEVEL_MAX = 10;

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const isSlug = (value: unknown): value is string => typeof value === "string" && SLUG.test(value);

const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

interface RuleStrategy {
  /** The rule from stored or admin data, or `null` when its parameters break the rules. */
  parse(data: Record<string, unknown>): BadgeRule | null;
  /** How far the attendee is: `current` out of `target` (earned when `current >= target`). */
  progress(rule: BadgeRule, player: PlayerProgress): { current: number; target: number };
}

const countRule = (type: "missions-completed" | "talks-attended" | "stands-visited" | "credits-earned" | "contacts-made", max: number, read: (player: PlayerProgress) => number): RuleStrategy => ({
  parse: (data) => (whole(data.count, 1, max) ? ({ type, count: data.count } as BadgeRule) : null),
  progress: (rule, player) => ({ current: read(player), target: (rule as { count: number }).count }),
});

/** One strategy per rule type: how to read its parameters and how to measure an attendee against it. */
export const RULES: Readonly<Record<RuleType, RuleStrategy>> = {
  "missions-completed": countRule("missions-completed", RULE_COUNT_MAX, (player) => player.completedMissionIds.size),
  "talks-attended": countRule("talks-attended", RULE_COUNT_MAX, (player) => player.talks),
  "stands-visited": countRule("stands-visited", RULE_COUNT_MAX, (player) => player.stands),
  "credits-earned": countRule("credits-earned", RULE_CREDITS_MAX, (player) => player.credits),
  "contacts-made": countRule("contacts-made", RULE_COUNT_MAX, (player) => player.contacts),
  "level-reached": {
    // Level 1 is everyone's from the start: not an achievement.
    parse: (data) => (whole(data.level, 2, RULE_LEVEL_MAX) ? { type: "level-reached", level: data.level } : null),
    progress: (rule, player) => ({ current: player.level, target: (rule as { level: number }).level }),
  },
  "quadrant-complete": {
    parse: (data) => (isSlug(data.quadrantId) ? { type: "quadrant-complete", quadrantId: data.quadrantId } : null),
    progress: (rule, player) => {
      const missions = player.missionsByQuadrant.get((rule as { quadrantId: string }).quadrantId) ?? [];
      // A quadrant without missions cannot be completed: its target stays out of reach.
      if (missions.length === 0) return { current: 0, target: 1 };
      return { current: missions.filter((id) => player.completedMissionIds.has(id)).length, target: missions.length };
    },
  },
  "mission-completed": {
    parse: (data) => (isSlug(data.missionId) ? { type: "mission-completed", missionId: data.missionId } : null),
    progress: (rule, player) => ({ current: player.completedMissionIds.has((rule as { missionId: string }).missionId) ? 1 : 0, target: 1 }),
  },
};

export const isRuleType = (value: unknown): value is RuleType => typeof value === "string" && (RULE_TYPES as readonly string[]).includes(value);

export function parseRule(input: unknown): BadgeRule | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  return isRuleType(data.type) ? RULES[data.type].parse(data) : null;
}

export const ruleProgress = (rule: BadgeRule, player: PlayerProgress) => RULES[rule.type].progress(rule, player);
export const meetsRule = (rule: BadgeRule, player: PlayerProgress) => {
  const { current, target } = ruleProgress(rule, player);
  return current >= target;
};

export type BadgeDataErrorCode = "invalid-id" | "invalid-name" | "invalid-description" | "invalid-tone" | "invalid-rule";

const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** Checks a badge from stored or admin data (the id comes from the document) and says which field is wrong. */
export function checkBadge(id: string, input: unknown): { ok: true; value: Badge } | { ok: false; code: BadgeDataErrorCode } {
  if (!isSlug(id)) return { ok: false, code: "invalid-id" };
  const data = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const name = text(data.name, BADGE_NAME_MIN, BADGE_NAME_MAX);
  if (!name) return { ok: false, code: "invalid-name" };
  const description = text(data.description, BADGE_DESCRIPTION_MIN, BADGE_DESCRIPTION_MAX);
  if (!description) return { ok: false, code: "invalid-description" };
  if (typeof data.tone !== "string" || !(BADGE_TONES as readonly string[]).includes(data.tone)) return { ok: false, code: "invalid-tone" };
  const rule = parseRule(data.rule);
  if (!rule) return { ok: false, code: "invalid-rule" };
  return {
    ok: true,
    value: {
      id,
      name,
      description,
      tone: data.tone as BadgeTone,
      rule,
      order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER,
      active: data.active === true,
      // Stored as a path; the data layer turns it into a reference with its address.
      image: null,
    },
  };
}

export const parseBadge = (id: string, input: unknown): Badge | null => {
  const checked = checkBadge(id, input);
  return checked.ok ? checked.value : null;
};
