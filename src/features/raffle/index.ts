// Public API (client-safe). Server-only exports live in `./server`.
export {
  DEFAULT_RAFFLE,
  DEFAULT_RULE,
  MIN_CREDITS_MAX,
  MIN_XP_MAX,
  PRIZE_NAME_MAX,
  PRIZE_QUANTITY_MAX,
  TOP_N_MAX,
  type CadetTickets,
  type PrizeRule,
  type PrizeRuleKind,
  type RaffleDraw,
  type RaffleErrorCode,
  type RaffleOverview,
  type RafflePrize,
  type RafflePrizeOverview,
  type RaffleSettings,
} from "./domain/raffle";
export type { CreateRafflePrizeAction, DrawRaffleAction, DrawRaffleActionResult, RaffleActionResult, RaffleActions, SaveRaffleSettingsAction, UpdateRafflePrizeAction, VoidRaffleDrawAction } from "./ui/actions";
export { RaffleAdminView, type RaffleAdminViewProps } from "./ui/RaffleAdminView";
