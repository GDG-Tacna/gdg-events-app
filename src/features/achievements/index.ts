// Public API (client-safe). Server-only exports live in `./server`.
export * from "./domain/badge";
export type { BadgeStanding } from "./domain/achievements";
export type { AchievementAdminErrorCode } from "./domain/manage";
export { DEFAULT_BADGES } from "./data/default-badges";
export { AchievementsView, type AchievementsViewProps } from "./ui/AchievementsView";
export { ruleText, type RuleNames } from "./ui/rule-text";
export type { BadgeDraft } from "./domain/manage";
export type { AchievementAdminActionResult, MoveBadgeAction, SaveBadgeAction, SeedBadgesAction, SetBadgeActiveAction } from "./ui/admin-actions";
export { BadgesAdminView, type BadgesAdminViewProps } from "./ui/BadgesAdminView";
export { BadgeForm, type BadgeFormProps } from "./ui/BadgeForm";
