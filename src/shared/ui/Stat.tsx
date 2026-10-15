import type { ReactNode } from "react";
import { formatNumber } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

export interface StatProps {
  /** A pixel sprite (decorative) shown next to the number. */
  icon: ReactNode;
  value: number;
  label: string;
  /** A short extra line under the label ("+40 en este evento"). */
  hint?: string;
  className?: string;
}

/** A big number with its label, such as "120 XP Estelar". The sprite is decorative: the label names the number. */
export function Stat({ icon, value, label, hint, className }: StatProps) {
  return (
    <div className={cn("gap-space-1 flex flex-col", className)}>
      <div className="gap-space-2 flex items-center">
        {icon}
        <span className="type-stat text-foreground tabular-nums">{formatNumber(value)}</span>
      </div>
      <p className="type-caption text-text-subtle">{label}</p>
      {hint ? <p className="type-caption text-gold">{hint}</p> : null}
    </div>
  );
}
