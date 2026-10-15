import type { UploadImageAction } from "@/features/media";
import type { RaffleErrorCode } from "../domain/raffle";

export type RaffleActionResult = { ok: true } | { ok: false; code: RaffleErrorCode };
/** A draw's outcome as the admin screen shows it right away. */
export type DrawRaffleActionResult = { ok: true; winnerAlias: string; tickets: number; totalTickets: number } | { ok: false; code: RaffleErrorCode };

export type SaveRaffleSettingsAction = (input: { minCredits: number }) => Promise<RaffleActionResult>;
export type CreateRafflePrizeAction = (input: { name: string; quantity: number; imagePath?: string | null }) => Promise<RaffleActionResult>;
export type UpdateRafflePrizeAction = (input: { id: string; name?: string; quantity?: number; active?: boolean; imagePath?: string | null }) => Promise<RaffleActionResult>;
export type DrawRaffleAction = (input: { prizeId: string }) => Promise<DrawRaffleActionResult>;
export type VoidRaffleDrawAction = (input: { drawId: string }) => Promise<RaffleActionResult>;

export interface RaffleActions {
  saveSettings: SaveRaffleSettingsAction;
  createPrize: CreateRafflePrizeAction;
  updatePrize: UpdateRafflePrizeAction;
  draw: DrawRaffleAction;
  voidDraw: VoidRaffleDrawAction;
  /** Uploads a prize's photo. */
  upload: UploadImageAction;
}
