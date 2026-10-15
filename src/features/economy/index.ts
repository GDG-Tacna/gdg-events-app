// Public API (client-safe). Server-only exports live in `./server`.
export { CREDIT_MISSION_TYPES, DEFAULT_ECONOMY, type EconomyErrorCode, type EconomySettings } from "./domain/settings";
export type { SquadCreditsErrorCode, SquadCreditsOverview, SquadPrize, SquadRedemption, SquadWallet } from "./domain/squad-credits";
export { EconomySettingsView, type EconomySettingsViewProps, type SaveEconomyAction, type SaveEconomyActionResult } from "./ui/EconomySettingsView";
export { PrizeForm, suggestPrizeId, type PrizeFormProps, type PrizeInput } from "./ui/PrizeForm";
export {
  SquadCreditsAdminView,
  type AwardSquadBonusAction,
  type RedeemSquadPrizeAction,
  type SaveSquadPrizeAction,
  type SetSquadPrizeActiveAction,
  type SquadCreditsActionResult,
  type SquadCreditsAdminViewProps,
} from "./ui/SquadCreditsAdminView";
export { SquadCreditsCard, type SquadCreditsCardProps } from "./ui/SquadCreditsCard";
