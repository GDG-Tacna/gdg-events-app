import { cn } from "@/shared/lib/utils";

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name: what this bar measures. */
  label: string;
  /** Spoken value ("750 de 2000 XP"). Defaults to the percentage. */
  valueText?: string;
  className?: string;
}

function toPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/**
 * Progress bar with the Design System gradient. The fill is rendered at its real width and grows
 * from empty on first paint with a CSS animation, so there is no client state; under reduced motion
 * the global rule makes the animation and later transitions instant. The semantics always carry the
 * real value, whatever the fill is doing.
 */
export function ProgressBar({ value, max = 100, label, valueText, className }: ProgressBarProps) {
  const percent = toPercent(value, max);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), max)}
      aria-valuetext={valueText}
      className={cn("bg-secondary h-3 w-full overflow-hidden rounded-pill", className)}
    >
      <div
        className="from-violet to-cyan animate-progress-grow h-full rounded-pill bg-linear-to-r transition-[width] duration-[600ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
