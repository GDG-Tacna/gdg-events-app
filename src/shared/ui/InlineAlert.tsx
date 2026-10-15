import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Icon } from "./Icon";

export interface InlineAlertProps {
  children: ReactNode;
  className?: string;
}

/** Error message announced to assistive tech. The icon and text carry the meaning, not just the color. */
export function InlineAlert({ children, className }: InlineAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-danger/60 bg-danger/10 flex items-start gap-space-3 rounded-md border p-space-3",
        className,
      )}
    >
      <Icon name="alert" size={20} className="text-danger mt-0.5" />
      <p className="type-body-sm text-foreground">{children}</p>
    </div>
  );
}
