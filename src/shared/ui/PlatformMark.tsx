import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { ArtTile } from "./pixel/ArtTile";
import { PixelGdgLogo } from "./pixel/PixelGdgLogo";

export interface PlatformMarkProps {
  className?: string;
}

/**
 * The mark of the events platform itself (GDG Tacna · Eventos), for the screens where organizers work. It names no
 * edition: tonight's event can be a DevFest and the next one a Build with AI, so the admin never carries the name or
 * tagline of one of them. The cadets' screens show the edition's own brand instead (`BrandMark`).
 */
export function PlatformMark({ className }: PlatformMarkProps) {
  return (
    <div className={cn("gap-space-3 flex items-center", className)}>
      <ArtTile className="size-16 shrink-0 p-0">
        <PixelGdgLogo scale={2} />
      </ArtTile>
      <p className="type-label text-foreground min-w-0">{copy.admin.brand}</p>
    </div>
  );
}
