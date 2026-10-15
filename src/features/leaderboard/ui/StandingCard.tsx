import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Card, Icon } from "@/shared/ui";
import type { CadetStanding, RankedCadet } from "../domain/ranking";

export interface StandingCardProps {
  standing: CadetStanding;
  /** The cadet's own alias and squad name, for their row when they are below the top. */
  alias: string;
  squad: string | null;
}

function Row({ cadet }: { cadet: RankedCadet }) {
  const t = copy.leaderboard.card;
  return (
    <li
      aria-current={cadet.isMe ? "true" : undefined}
      className={cn(
        "gap-space-3 px-space-3 grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center rounded-md border",
        cadet.isMe ? "border-primary bg-primary/10" : "border-transparent",
      )}
    >
      <span className="type-pixel-tag text-text-subtle tabular-nums">{cadet.position}</span>
      <span className="flex min-w-0 flex-col">
        <span className="type-label text-foreground truncate">
          {cadet.alias}
          {cadet.isMe ? <span className="text-primary"> · {t.you}</span> : null}
        </span>
        <span className="type-caption text-text-subtle truncate">{cadet.squad ?? t.noSquad}</span>
      </span>
      <span className="type-label text-accent tabular-nums">{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
    </li>
  );
}

/**
 * The cadet's place in the fleet ("#23 de 280 cadetes") and the top 10. When the cadet is further down, their own
 * row follows the top so they always see where they are.
 */
export function StandingCard({ standing, alias, squad }: StandingCardProps) {
  const t = copy.leaderboard.card;
  const inTop = standing.top.some((cadet) => cadet.isMe);
  const total = formatNumber(standing.total);

  return (
    <Card role="region" aria-label={t.title} className="gap-space-4 flex flex-col">
      <div className="gap-space-3 flex items-start justify-between">
        <div className="gap-space-1 flex min-w-0 flex-col">
          <h2 className="type-title text-foreground">{t.title}</h2>
          {standing.position === null ? <p className="type-body-sm text-muted-foreground">{t.noPosition}</p> : null}
        </div>
        <Icon name="trophy" size={28} className="text-gold" />
      </div>

      {standing.position !== null ? (
        <p className="gap-space-2 flex items-baseline">
          <span className="sr-only">{interpolate(t.positionSpoken, { n: String(standing.position), total })}</span>
          <span aria-hidden="true" className="type-pixel-tag text-primary text-3xl">
            {interpolate(t.position, { n: String(standing.position) })}
          </span>
          <span aria-hidden="true" className="type-body text-muted-foreground">
            {interpolate(t.of, { total })}
          </span>
        </p>
      ) : null}

      {standing.top.length > 0 ? (
        <div className="gap-space-2 flex flex-col">
          <h3 className="type-caption text-text-subtle tracking-wide uppercase">{t.topLabel}</h3>
          <ol aria-label={t.topLabel} className="gap-space-1 flex flex-col">
            {standing.top.map((cadet) => (
              <Row key={cadet.position} cadet={cadet} />
            ))}
          </ol>
          {!inTop && standing.position !== null ? (
            <ol aria-label={t.gap} className="border-border pt-space-2 border-t">
              <Row cadet={{ position: standing.position, alias, squad, xp: standing.xp, isMe: true }} />
            </ol>
          ) : null}
        </div>
      ) : (
        <p className="type-body-sm text-muted-foreground">{t.empty}</p>
      )}
    </Card>
  );
}
