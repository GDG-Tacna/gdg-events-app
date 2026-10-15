import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { buttonClasses } from "./Button";
import { buttonVariants } from "./primitives/button";

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  block?: boolean;
}

/** A navigation link that looks like a Button, so route changes stay real links (not onClick handlers). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  block = false,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      {...props}
      className={cn(buttonVariants(), buttonClasses({ variant, size, block }), className)}
    />
  );
}
