import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Card, Icon, type IconName } from "@/shared/ui";
import type { InsightsOverview } from "../domain/stats";

export interface InsightsPanelProps {
  overview: InsightsOverview;
}

/** "62 %": a share of a whole, or `null` when the whole is 0. */
export function share(part: number, whole: number): string | null {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : null;
}

function StatTile({ icon, label, value, hint }: { icon: IconName; label: string; value: number; hint?: string | null }) {
  return (
    <div className="bg-surface border-border gap-space-3 p-space-4 flex items-center rounded-lg border">
      <span aria-hidden="true" className="border-cyan/40 text-cyan bg-bg-deep grid size-11 shrink-0 place-items-center rounded-md border">
        <Icon name={icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="type-title text-foreground tabular-nums">{formatNumber(value)}</span>
        <span className="type-caption text-text-subtle">{label}</span>
        {hint ? <span className="type-caption text-lime">{hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * How the edition is going: the main counts as tiles, the rations per meal, and each earlier edition in short. Only
 * shows; the numbers arrive ready.
 */
export function InsightsPanel({ overview }: InsightsPanelProps) {
  const t = copy.admin.home;
  const { current } = overview;
  const attendedShare = share(current.attended, current.registered);

  return (
    <div className="gap-space-5 flex flex-col">
      <section aria-labelledby="insights-edition" className="gap-space-3 flex flex-col">
        <h2 id="insights-edition" className="type-pixel-heading text-cyan">
          {interpolate(t.editionTitle, { id: current.eventId })}
        </h2>
        <ul aria-label={t.stats.label} className="gap-space-3 grid grid-cols-1 min-[560px]:grid-cols-2 min-[1024px]:grid-cols-3">
          <li><StatTile icon="users" label={t.stats.registered} value={current.registered} /></li>
          <li>
            <StatTile icon="login" label={t.stats.attended} value={current.attended} hint={attendedShare ? interpolate(t.stats.attendedShare, { pct: attendedShare }) : null} />
          </li>
          <li><StatTile icon="mic" label={t.stats.talkCheckIns} value={current.talkCheckIns} /></li>
          <li><StatTile icon="store" label={t.stats.standVisits} value={current.standVisits} /></li>
          <li><StatTile icon="target" label={t.stats.missionsCompleted} value={current.missionsCompleted} /></li>
          <li><StatTile icon="users" label={t.stats.contacts} value={current.contacts} /></li>
        </ul>
      </section>

      <div className="gap-space-4 grid grid-cols-1 min-[760px]:grid-cols-2">
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-title text-foreground">{t.rationsTitle}</h2>
          {current.rations.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">{t.noRations}</p>
          ) : (
            <ul className="gap-space-2 flex flex-col">
              {current.rations.map((meal) => (
                <li key={meal.checkpointId} className="border-border gap-space-3 py-space-2 flex items-center justify-between border-b last:border-b-0">
                  <span className="type-label text-foreground">{meal.name}</span>
                  <span className="type-title text-cyan tabular-nums">
                    {formatNumber(meal.count)}
                    {share(meal.count, current.attended) ? <span className="type-caption text-text-subtle ml-space-2">{share(meal.count, current.attended)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-title text-foreground">{t.pastTitle}</h2>
          {overview.past.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">{t.noPast}</p>
          ) : (
            <ul className="gap-space-2 flex flex-col">
              {overview.past.map((edition) => (
                <li key={edition.eventId} className="border-border gap-space-1 py-space-2 flex flex-col border-b last:border-b-0">
                  <span className="type-label text-foreground">{edition.eventId}</span>
                  <span className="type-caption text-muted-foreground tabular-nums">
                    {interpolate(t.past, { registered: formatNumber(edition.registered), attended: formatNumber(edition.attended) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
