import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import { PixelMedal, type MedalTone } from "./pixel/PixelMedal";

const TONES: readonly string[] = ["cyan", "lime", "gold", "magenta", "violet"];
const MEDAL_SIZE = 16;

export interface MedalArtProps {
  /** The medal's colour, also used when there is no image. */
  tone: string;
  /** An uploaded image that replaces the pixel medal. */
  imageUrl?: string | null;
  /** Still to earn: the image is shown in grey, like the locked medal. */
  locked?: boolean;
  /** Same scale as the pixel medal (16 px each), so both take the same room. */
  scale?: number;
  className?: string;
}

/**
 * A badge's art: its uploaded image when it has one, otherwise the pixel medal in its colour. Decorative: the badge's
 * name always sits next to it.
 */
export function MedalArt({ tone, imageUrl, locked = false, scale = 3, className }: MedalArtProps) {
  if (!imageUrl) return <PixelMedal tone={(TONES.includes(tone) ? tone : "cyan") as MedalTone} locked={locked} scale={scale} className={className} />;
  const size = MEDAL_SIZE * scale;
  return (
    <Image
      src={imageUrl}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 rounded-md object-contain", locked && "opacity-60 grayscale", className)}
      style={{ width: size, height: size }}
    />
  );
}
