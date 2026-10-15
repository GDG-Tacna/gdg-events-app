import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Dark cell that frames pixel art. The art is inside; the frame itself stays modern, never pixelated. */
export function ArtTile({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "bg-bg-deep border-border inline-flex items-center justify-center rounded-sm border p-space-2",
        className,
      )}
    />
  );
}
