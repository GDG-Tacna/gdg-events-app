import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Card, PixelCoin, Stat, Thumbnail } from "@/shared/ui";
import type { SquadPrize } from "../domain/squad-credits";

export interface SquadCreditsCardProps {
  balance: number;
  /** Prizes the squad can still get, cheapest first (`getSquadStanding`). */
  prizes: readonly SquadPrize[];
}

/** The member's view of their squad's credits: the balance and how far each prize is. */
export function SquadCreditsCard({ balance, prizes }: SquadCreditsCardProps) {
  const t = copy.dashboard.squadCredits;
  return (
    <Card role="region" aria-label={t.label} className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <h2 className="type-heading text-foreground">{t.title}</h2>
        <p className="type-caption text-text-subtle">{t.help}</p>
      </div>
      <Stat icon={<PixelCoin />} value={balance} label={t.balanceLabel} />
      <div className="gap-space-2 flex flex-col">
        <h3 className="type-label text-foreground">{t.prizesTitle}</h3>
        {prizes.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t.noPrizes}</p>
        ) : (
          <ul className="gap-space-2 flex flex-col">
            {prizes.map((prize) => {
              const missing = prize.cost - balance;
              return (
                <li key={prize.id} className="border-line-strong p-space-3 gap-space-3 flex items-start rounded-md border">
                  {prize.image ? <Thumbnail url={prize.image.url} size={48} /> : null}
                  <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                    <div className="gap-space-2 flex items-baseline justify-between">
                      <span className="type-label text-foreground">{prize.name}</span>
                      <span className="type-caption text-text-subtle shrink-0 tabular-nums">{interpolate(t.cost, { n: formatNumber(prize.cost) })}</span>
                    </div>
                    {prize.description ? <span className="type-caption text-muted-foreground">{prize.description}</span> : null}
                    <span className="type-caption">
                      {missing <= 0 ? <span className="text-accent">{t.reachable}</span> : <span className="text-text-subtle">{interpolate(t.missing, { n: formatNumber(missing) })}</span>}
                      {prize.stock === null ? null : <span className="text-text-subtle"> · {interpolate(t.stock, { n: formatNumber(prize.stock) })}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
