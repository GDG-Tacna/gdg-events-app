import type { ImageRef } from "@/features/media/constants";
import type { PixelSpriteData } from "@/shared/types/pixel";
import type { SquadId } from "@/shared/types/squad";

/**
 * A squad as the attendee sees it. Admins define and maintain these records (phase 2), so everything here
 * is plain data.
 */
export interface Squad {
  id: SquadId;
  name: string;
  tagline: string;
  /** 16-bit logo of the squad, drawn in the admin (always present: the fallback). */
  sprite: PixelSpriteData;
  /** An uploaded logo (image or cleaned SVG) shown instead of the pixel one; absent when there is none. */
  logo?: ImageRef | null;
  /**
   * Offered to new attendees. A retired squad (`false`) is never offered again, but its members keep it,
   * with its name and logo, on their card and in the rankings.
   */
  active: boolean;
}

/** The squads a new attendee can be given, in catalog order. */
export const offeredSquads = (squads: readonly Squad[]): readonly Squad[] => squads.filter((squad) => squad.active);
