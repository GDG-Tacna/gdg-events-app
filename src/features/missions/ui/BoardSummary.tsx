import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { ProgressBar } from "@/shared/ui";

export interface BoardSummaryProps {
  done: number;
  total: number;
  xp: number;
  credits: number;
  /** The bar's own value, when it should lag behind `done` (it grows to `done` after the first paint). */
  barValue?: number;
}

/**
 * The board's overall progress: missions done, XP and G-Credits earned, and the bar. Pure markup, so the server draws
 * it as it is and the celebration (a client component) can draw it again with numbers that count up.
 */
export function BoardSummary({ done, total, xp, credits, barValue = done }: BoardSummaryProps) {
  const summary = interpolate(copy.missions.summary, { done: String(done), total: String(total) });
  return (
    <>
      <div className="gap-space-3 flex flex-wrap items-center justify-between">
        <p className="type-label text-foreground">{summary}</p>
        <p className="gap-space-3 flex items-center">
          <span className="type-pixel-tag text-accent">
            <span className="sr-only">{copy.missions.earned}: </span>
            {interpolate(copy.missions.xp, { xp: formatNumber(xp) })}
          </span>
          {credits > 0 ? (
            <span className="type-pixel-tag text-gold">
              <span className="sr-only">{copy.missions.earnedCredits}: </span>
              {interpolate(copy.missions.credits, { n: formatNumber(credits) })}
            </span>
          ) : null}
        </p>
      </div>
      <ProgressBar value={barValue} max={total} label={copy.missions.summaryLabel} valueText={summary} />
    </>
  );
}
