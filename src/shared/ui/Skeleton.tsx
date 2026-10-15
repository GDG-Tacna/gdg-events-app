import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

/** Loading placeholder for content. Decorative: pair the container with an accessible loading label. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={cn("bg-secondary animate-pulse rounded-md", className)}
    />
  );
}
