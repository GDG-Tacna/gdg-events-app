import "server-only";

// Public API (server-only). Client code must import from "@/features/achievements" instead.
export * from "./domain/badge";
export {
  offeredBadges,
  syncAchievements,
  type AchievementDeps,
  type AchievementsResult,
  type AwardStore,
  type BadgeSource,
  type BadgeStanding,
  type ProgressSource,
} from "./domain/achievements";
export {
  createBadge,
  listManagedBadges,
  moveBadge,
  seedBadges,
  setBadgeActive,
  updateBadge,
  type AchievementAdminActor,
  type AchievementAdminDeps,
  type AchievementAdminError,
  type AchievementAdminErrorCode,
  type AchievementAuditEntry,
  type AchievementDirectory,
  type BadgeDraft,
  type BadgePatch,
  type BadgeStore,
} from "./domain/manage";
export { DEFAULT_BADGES } from "./data/default-badges";
export { CachedBadgeSource, FirestoreBadgeStore } from "./data/server/firestore-badge-store";
export { FirestoreAwardStore } from "./data/server/firestore-award-store";
