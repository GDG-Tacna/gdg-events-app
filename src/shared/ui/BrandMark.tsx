import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { ArtTile } from "./pixel/ArtTile";
import { PixelGdgLogo } from "./pixel/PixelGdgLogo";

export interface BrandMarkProps {
  /** Heading level for the product name; use "h1" when the mark is the page title. */
  titleAs?: "h1" | "p";
  className?: string;
}

/**
 * The GDG Tacna mark in pixel art, the "DevFest" pixel wordmark, "SPACE ARCADE" and the tagline. Screen readers hear
 * the product's full name once.
 */
export function BrandMark({ titleAs: Title = "p", className }: BrandMarkProps) {
  return (
    <div className={cn("gap-space-3 flex items-center", className)}>
      <ArtTile className="size-16 shrink-0 p-0">
        <PixelGdgLogo scale={2} />
      </ArtTile>
      <div className="gap-space-1 flex min-w-0 flex-col">
        <Title className="type-pixel-title text-foreground leading-none">
          <span aria-hidden="true">{copy.brand.wordmark}</span>
          <span className="sr-only">{copy.brand.name}</span>
        </Title>
        <p aria-hidden="true" className="type-caption text-cyan font-semibold tracking-[0.18em] uppercase">
          {copy.brand.arcade}
        </p>
        <p className="type-caption text-gold gap-space-1 flex items-center">
          <span aria-hidden="true">★</span>
          {copy.brand.tagline}
        </p>
      </div>
    </div>
  );
}
