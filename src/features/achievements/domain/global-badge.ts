import type { ImageRef } from "@/features/media/constants";
import {
  BADGE_DESCRIPTION_MAX,
  BADGE_DESCRIPTION_MIN,
  BADGE_NAME_MAX,
  BADGE_NAME_MIN,
  BADGE_TONES,
  RULE_COUNT_MAX,
  RULE_CREDITS_MAX,
  isSlug,
  type BadgeDataErrorCode,
  type BadgeTone,
} from "./badge";

/**
 * Global community achievements evaluated across every GDG Tacna edition (attendance across events,
 * lifetime G-Credits, total edition badges earned, verified certificates and total networking contacts).
 */
export const GLOBAL_RULE_TYPES = [
  "events-attended",
  "total-credits",
  "total-badges",
  "certificates-earned",
  "total-contacts",
] as const;
export type GlobalRuleType = (typeof GLOBAL_RULE_TYPES)[number];

export type GlobalBadgeRule =
  | { type: "events-attended"; count: number }
  | { type: "total-credits"; count: number }
  | { type: "total-badges"; count: number }
  | { type: "certificates-earned"; count: number }
  | { type: "total-contacts"; count: number };

export interface GlobalBadge {
  id: string;
  name: string;
  description: string;
  tone: BadgeTone;
  rule: GlobalBadgeRule;
  order: number;
  active: boolean;
  /** Optional uploaded image replacing the pixel medal. */
  image: ImageRef | null;
}

/** One user's aggregated progress across every GDG Tacna edition. */
export interface GlobalPlayerProgress {
  eventsAttended: number;
  totalCredits: number;
  totalBadges: number;
  certificatesEarned: number;
  totalContacts: number;
}

const whole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

interface GlobalRuleStrategy {
  parse(data: Record<string, unknown>): GlobalBadgeRule | null;
  progress(rule: GlobalBadgeRule, player: GlobalPlayerProgress): { current: number; target: number };
}

const countRule = (
  type: GlobalRuleType,
  max: number,
  read: (player: GlobalPlayerProgress) => number,
): GlobalRuleStrategy => ({
  parse: (data) => (whole(data.count, 1, max) ? ({ type, count: data.count } as GlobalBadgeRule) : null),
  progress: (rule, player) => ({ current: read(player), target: rule.count }),
});

export const GLOBAL_RULES: Readonly<Record<GlobalRuleType, GlobalRuleStrategy>> = {
  "events-attended": countRule("events-attended", 100, (player) => player.eventsAttended),
  "total-credits": countRule("total-credits", RULE_CREDITS_MAX, (player) => player.totalCredits),
  "total-badges": countRule("total-badges", RULE_COUNT_MAX, (player) => player.totalBadges),
  "certificates-earned": countRule("certificates-earned", 100, (player) => player.certificatesEarned),
  "total-contacts": countRule("total-contacts", RULE_COUNT_MAX, (player) => player.totalContacts),
};

export const isGlobalRuleType = (value: unknown): value is GlobalRuleType =>
  typeof value === "string" && (GLOBAL_RULE_TYPES as readonly string[]).includes(value);

export function parseGlobalRule(input: unknown): GlobalBadgeRule | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  return isGlobalRuleType(data.type) ? GLOBAL_RULES[data.type].parse(data) : null;
}

export const globalRuleProgress = (rule: GlobalBadgeRule, player: GlobalPlayerProgress) =>
  GLOBAL_RULES[rule.type].progress(rule, player);

export const meetsGlobalRule = (rule: GlobalBadgeRule, player: GlobalPlayerProgress): boolean => {
  const { current, target } = globalRuleProgress(rule, player);
  return current >= target;
};

const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** Validates a global badge from stored or admin data. */
export function checkGlobalBadge(
  id: string,
  input: unknown,
): { ok: true; value: GlobalBadge } | { ok: false; code: BadgeDataErrorCode } {
  if (!isSlug(id)) return { ok: false, code: "invalid-id" };
  const data = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const name = text(data.name, BADGE_NAME_MIN, BADGE_NAME_MAX);
  if (!name) return { ok: false, code: "invalid-name" };
  const description = text(data.description, BADGE_DESCRIPTION_MIN, BADGE_DESCRIPTION_MAX);
  if (!description) return { ok: false, code: "invalid-description" };
  if (typeof data.tone !== "string" || !(BADGE_TONES as readonly string[]).includes(data.tone)) {
    return { ok: false, code: "invalid-tone" };
  }
  const rule = parseGlobalRule(data.rule);
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
      image: null,
    },
  };
}

export const parseGlobalBadge = (id: string, input: unknown): GlobalBadge | null => {
  const checked = checkGlobalBadge(id, input);
  return checked.ok ? checked.value : null;
};
