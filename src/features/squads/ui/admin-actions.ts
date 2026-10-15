import type { ImageRef } from "@/features/media";
import type { PixelSpriteData } from "@/shared/types/pixel";
import type { SquadAdminErrorCode } from "../domain/manage";

/** A squad as the admin screens show it. Plain data: it crosses the client boundary. */
export interface SquadView {
  id: string;
  name: string;
  tagline: string;
  sprite: PixelSpriteData;
  /** The uploaded logo shown instead of the pixel one, when there is one. */
  logo?: ImageRef | null;
  active: boolean;
  order: number;
}

/** What the squad management actions answer. The screens refresh their list after a success. */
export type SquadAdminActionResult = { ok: true } | { ok: false; code: SquadAdminErrorCode };

export type SeedSquadsAction = () => Promise<SquadAdminActionResult>;
export type CreateSquadAction = (input: { id: string; name: string; tagline: string; sprite: PixelSpriteData; logoPath?: string | null }) => Promise<SquadAdminActionResult>;
export type UpdateSquadAction = (input: { id: string; name: string; tagline: string; sprite: PixelSpriteData; logoPath?: string | null }) => Promise<SquadAdminActionResult>;
export type SquadIdAction = (input: { id: string }) => Promise<SquadAdminActionResult>;
export type MoveSquadAction = (input: { id: string; to: number }) => Promise<SquadAdminActionResult>;
