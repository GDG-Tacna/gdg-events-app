import "server-only";

// Public API (server-only). Client code must import from "@/features/achievements" instead.
export * from "./domain/badge";
export * from "./domain/global-badge";
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
  offeredGlobalBadges,
  syncGlobalAchievements,
  type EditionAchievementsGroup,
  type GlobalAchievementDeps,
  type GlobalAchievementsResult,
  type GlobalAwardStore,
  type GlobalBadgeSource,
  type GlobalBadgeStanding,
  type GlobalProgressSource,
} from "./domain/global-achievements";
export {
  createBadge,
  deleteBadge,
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
export {
  createGlobalBadge,
  deleteGlobalBadge,
  listManagedGlobalBadges,
  moveGlobalBadge,
  seedGlobalBadges,
  setGlobalBadgeActive,
  updateGlobalBadge,
  type GlobalAchievementAdminActor,
  type GlobalAchievementAdminDeps,
  type GlobalBadgeDeletion,
  type GlobalBadgeDraft,
  type GlobalBadgePatch,
  type GlobalBadgeStore,
} from "./domain/manage-global";
export { DEFAULT_BADGES } from "./data/default-badges";
export { DEFAULT_GLOBAL_BADGES } from "./data/default-global-badges";
export { CachedBadgeSource, FirestoreBadgeStore } from "./data/server/firestore-badge-store";
export { FirestoreAwardStore } from "./data/server/firestore-award-store";
export {
  CachedGlobalBadgeSource,
  FirestoreCrossEditionAchievementsReader,
  FirestoreGlobalAwardStore,
  FirestoreGlobalBadgeStore,
  type CrossEditionAchievementsSnapshot,
  type EditionSummaryRef,
} from "./data/server/firestore-global-achievements";
