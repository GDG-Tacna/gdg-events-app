import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Card, MedalArt, ProgressBar } from "@/shared/ui";
import type { BadgeStanding } from "../domain/achievements";

export interface AchievementsViewProps {
  /** The edition's active badges in order, each with the attendee's standing (`syncAchievements`). */
  badges: readonly BadgeStanding[];
}

const t = copy.achievements;
const formatDate = (at: Date) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: EDITION.timeZone }).format(new Date(at));

/**
 * The Logros tab: how many badges the attendee has, the ones earned (with the day) and the ones still to
 * earn with their progress. Everything is decided on the server; this view only lays it out.
 */
export function AchievementsView({ badges }: AchievementsViewProps) {
  const earned = badges.filter((standing) => standing.earnedAt !== null);
  const pending = badges.filter((standing) => standing.earnedAt === null);
  const summary = interpolate(t.summary, { earned: String(earned.length), total: String(badges.length) });

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      {badges.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : (
        <>
          <Card className="gap-space-3 flex flex-col">
            <p className="type-label text-foreground">{summary}</p>
            <ProgressBar value={earned.length} max={badges.length} label={t.summaryLabel} valueText={summary} />
          </Card>

          <section aria-labelledby="achievements-earned" className="gap-space-3 flex flex-col">
            <h2 id="achievements-earned" className="type-heading text-foreground">
              {t.earnedTitle}
            </h2>
            {earned.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">{t.noneEarned}</p>
            ) : (
              <ul className="gap-space-3 grid grid-cols-1 min-[560px]:grid-cols-2">
                {earned.map(({ badge, earnedAt }) => (
                  <li key={badge.id}>
                    <Card className="border-accent/50 gap-space-4 flex h-full items-center">
                      <MedalArt tone={badge.tone} imageUrl={badge.image?.url} scale={3} className="shrink-0" />
                      <div className="gap-space-1 flex min-w-0 flex-col">
                        <h3 className="type-label text-foreground">{badge.name}</h3>
                        <p className="type-caption text-muted-foreground">{badge.description}</p>
                        {earnedAt ? <p className="type-caption text-accent">{interpolate(t.earnedOn, { date: formatDate(earnedAt) })}</p> : null}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="achievements-pending" className="gap-space-3 flex flex-col">
            <h2 id="achievements-pending" className="type-heading text-foreground">
              {t.pendingTitle}
            </h2>
            {pending.length === 0 ? (
              <p className="type-body-sm text-foreground">{t.allEarned}</p>
            ) : (
              <ul className="gap-space-3 grid grid-cols-1 min-[560px]:grid-cols-2">
                {pending.map(({ badge, current, target }) => {
                  const progress = interpolate(t.progress, { current: formatNumber(current), target: formatNumber(target) });
                  return (
                    <li key={badge.id}>
                      <Card className="gap-space-4 flex h-full items-center">
                        <MedalArt tone={badge.tone} imageUrl={badge.image?.url} locked scale={3} className="shrink-0" />
                        <div className="gap-space-2 flex min-w-0 flex-1 flex-col">
                          <div className="gap-space-1 flex flex-col">
                            <h3 className="type-label text-foreground">{badge.name}</h3>
                            <p className="type-caption text-muted-foreground">{badge.description}</p>
                          </div>
                          <ProgressBar value={current} max={target} label={interpolate(t.progressLabel, { name: badge.name })} valueText={progress} />
                          <p className="type-caption text-text-subtle tabular-nums">{progress}</p>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
