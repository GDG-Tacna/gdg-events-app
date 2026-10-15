import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export interface CardProps extends ComponentProps<"div"> {
  /** `cyan` adds the active glow; use it on one element per screen. */
  tone?: "cyan";
  /** Set to false to lay out the content yourself. */
  pad?: boolean;
}

/** Base container: `surface` fill with a faint top sheen, 1px `line` border, large radius. */
export function Card({ tone, pad = true, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "bg-card text-card-foreground border-border rounded-lg border",
        // `bg-linear-*` is the Tailwind v4 name; the old `bg-gradient-to-*` made tailwind-merge drop `bg-card`.
        "bg-linear-to-b from-white/[0.03] to-transparent",
        // The glow keeps the card elevation instead of replacing it.
        tone === "cyan" ? "shadow-[var(--shadow-card),var(--shadow-glow-cyan)]" : "shadow-card",
        pad && "p-space-5",
        className,
      )}
    />
  );
}
