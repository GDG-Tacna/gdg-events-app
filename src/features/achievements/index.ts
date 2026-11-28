// Public API (client-safe). Server-only exports live in `./server`.
export * from "./domain/badge";
export * from "./domain/global-badge";
export type { BadgeStanding } from "./domain/achievements";
export type { EditionAchievementsGroup, GlobalBadgeStanding } from "./domain/global-achievements";
export type { AchievementAdminErrorCode, BadgeDraft } from "./domain/manage";
export type { GlobalBadgeDraft } from "./domain/manage-global";
export { DEFAULT_BADGES } from "./data/default-badges";
export { DEFAULT_GLOBAL_BADGES } from "./data/default-global-badges";
export { AchievementsView, type AchievementsViewProps } from "./ui/AchievementsView";
export { globalRuleText, ruleText, type RuleNames } from "./ui/rule-text";
export type { AchievementAdminActionResult, DeleteBadgeAction, MoveBadgeAction, SaveBadgeAction, SaveGlobalBadgeAction, SeedBadgesAction, SetBadgeActiveAction } from "./ui/admin-actions";
export { BadgesAdminView, type BadgesAdminViewProps } from "./ui/BadgesAdminView";
export { BadgeForm, type BadgeFormProps } from "./ui/BadgeForm";
export { GlobalBadgesAdminView, type GlobalBadgesAdminViewProps } from "./ui/GlobalBadgesAdminView";
export { GlobalBadgeForm, type GlobalBadgeFormProps } from "./ui/GlobalBadgeForm";
