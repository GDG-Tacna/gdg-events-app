import "server-only";

// Public API (server-only). XP and G-Credits are never granted from client code.
export {
  isValidReward,
  ledgerEntryId,
  minigameSource,
  missionSource,
  contactSource,
  talkSource,
  walletEarnId,
  type WalletSpender,
  type XpError,
  type XpErrorCode,
  type XpGrant,
  type XpGrantOutcome,
  type XpLedger,
  type XpSource,
} from "./domain/xp";
export {
  CONTACT_CAP_MAX,
  CONTACT_XP_MAX,
  CREDIT_MISSION_TYPES,
  DEFAULT_ECONOMY,
  contactRewardFor,
  getEconomyForEdit,
  getEconomySettings,
  missionCreditsFor,
  parseEconomySettings,
  saveEconomySettings,
  type EconomyAdminDeps,
  type EconomyDeps,
  type EconomyErrorCode,
  type EconomySettings,
  type EconomyStore,
} from "./domain/settings";
export { rewardTalk, type TalkRewardDeps } from "./domain/rewards";
export {
  BONUS_MAX,
  PRIZE_COST_MAX,
  awardSquadBonus,
  checkPrize,
  createPrize,
  getSquadCreditsOverview,
  getSquadStanding,
  parsePrize,
  redeemPrize,
  setPrizeActive,
  squadShare,
  updatePrize,
  type PrizePatch,
  type SquadCreditsActor,
  type SquadCreditsDeps,
  type SquadCreditsErrorCode,
  type SquadCreditsOverview,
  type SquadCreditsStore,
  type SquadPrize,
  type SquadRedemption,
  type SquadWallet,
} from "./domain/squad-credits";
export { FirestoreXpLedger } from "./data/server/firestore-xp-ledger";
export { FirestoreEconomyStore } from "./data/server/firestore-economy-store";
export { FirestoreSquadCreditsStore } from "./data/server/firestore-squad-credits-store";
