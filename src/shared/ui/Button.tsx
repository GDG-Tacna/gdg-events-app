import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Button as Primitive } from "./primitives/button";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-transparent text-foreground border border-input hover:bg-secondary",
  ghost: "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 px-4 has-[>svg]:px-4",
  md: "h-12 px-5 has-[>svg]:px-5",
  lg: "h-14 px-6 has-[>svg]:px-6",
};

/** Shared look for buttons and button-like links. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
}: { variant?: Variant; size?: Size; block?: boolean } = {}): string {
  return cn(
    "type-label rounded-md transition-[background-color,transform] duration-100 active:scale-[0.97]",
    "focus-visible:ring-ring focus-visible:ring-[3px]",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    block && "w-full",
  );
}

export interface ButtonProps
  extends Omit<ComponentProps<typeof Primitive>, "variant" | "size" | "children"> {
  variant?: Variant;
  size?: Size;
  /** Full-width button. */
  block?: boolean;
  /** Shows progress and blocks interaction; keep the label meaningful ("Conectando…"). */
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  /** Replaces the leading slot, for brand marks that are not part of the icon set. */
  leading?: ReactNode;
  children: ReactNode;
}

/**
 * Project adapter over the shadcn primitive: views use this API and never import the primitive.
 * 48px default height keeps touch targets above the 44px minimum.
 */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  icon,
  iconRight,
  leading,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <Primitive
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, block }), className)}
    >
      {loading ? <Icon name="loading" size={20} /> : leading ?? (icon ? <Icon name={icon} size={20} /> : null)}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={20} /> : null}
    </Primitive>
  );
}
