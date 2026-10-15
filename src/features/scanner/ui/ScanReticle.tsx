import { cn } from "@/shared/lib/utils";

export interface ScanReticleProps {
  /** While true the line sweeps; otherwise the reticle rests (for example while a code is being checked). */
  active: boolean;
  /** `done` tints the ring lime for a success and rose for a refusal. */
  tone?: "idle" | "success" | "error";
  className?: string;
}

const TONE: Record<NonNullable<ScanReticleProps["tone"]>, string> = {
  idle: "text-cyan",
  success: "text-lime",
  error: "text-danger",
};

/**
 * The cybernetic circle drawn over the camera: a ring with tick marks and a sweeping line. It is
 * decoration over a live picture, so it is hidden from assistive tech (the status line says what is
 * happening) and it holds still under reduced motion.
 */
export function ScanReticle({ active, tone = "idle", className }: ScanReticleProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="scan-reticle"
      className={cn("pointer-events-none absolute inset-0 grid place-items-center", TONE[tone], className)}
    >
      <div className="relative aspect-square w-[72%] max-w-[360px]">
        <svg viewBox="0 0 100 100" className="size-full" fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="47" strokeWidth="1.2" opacity="0.9" />
          <circle cx="50" cy="50" r="40" strokeWidth="0.5" opacity="0.5" strokeDasharray="1.5 3" />
          {/* Tick marks at the four directions. */}
          <path d="M50 1v8M50 91v8M1 50h8M91 50h8" strokeWidth="2" strokeLinecap="round" />
          {/* Corner brackets that frame the code. */}
          <path
            d="M24 34v-10h10M66 24h10v10M76 66v10H66M34 76H24V66"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {active ? (
          <div className="absolute inset-x-[18%] top-1/2 h-0.5 -translate-y-1/2 motion-reduce:hidden">
            <div className="animate-reticle-sweep bg-current/80 h-0.5 w-full rounded-pill shadow-[0_0_12px_currentColor]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
