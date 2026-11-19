import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export interface CardProps extends ComponentProps<"div"> {
  /** `cyan` adds the active glow; use it on one element per screen. */
  tone?: "cyan";
  /** Set to false to lay out the content yourself. */
  pad?: boolean;
}

/** Base container: flat `surface` panel with a 2px ink border and large radius, like the DevFest Tacna site. */
export function Card({ tone, pad = true, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "bg-card text-card-foreground rounded-lg border-2",
        // The highlighted card swaps the ink border for the brand blue instead of adding a glow.
        tone === "cyan" ? "border-cyan" : "border-ink",
        pad && "p-space-5",
        className,
      )}
    />
  );
}
