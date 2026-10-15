import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./pixel/PixelSprite";

const LOGO_SIZE = 16;

export interface SquadArtProps {
  /** The squad's 16x16 pixel logo: always there, shown when nothing was uploaded. */
  sprite: PixelSpriteData;
  /** An uploaded logo (image or cleaned SVG) that replaces the pixel one. */
  logoUrl?: string | null;
  /** Same scale as the pixel logo (16 px each), so both take the same room. */
  scale?: number;
  title?: string;
  className?: string;
}

/** A squad's logo: the uploaded one when there is one, otherwise its pixel drawing. */
export function SquadArt({ sprite, logoUrl, scale = 3, title, className }: SquadArtProps) {
  if (!logoUrl) return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
  const size = LOGO_SIZE * scale;
  return (
    <Image
      src={logoUrl}
      alt={title ?? ""}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
