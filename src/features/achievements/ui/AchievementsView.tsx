import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Card, MedalArt, ProgressBar } from "@/shared/ui";
import type { BadgeStanding } from "../domain/achievements";
import type { BadgeTone } from "../domain/badge";
import type { EditionAchievementsGroup, GlobalBadgeStanding } from "../domain/global-achievements";
import type { ImageRef } from "@/features/media/constants";

export interface AchievementsViewProps {
  /** Single-edition badges (kept for backwards compatibility when rendering one edition alone). */
  badges?: readonly BadgeStanding[];
  /** Global community badges across all GDG Tacna editions (always active: earned + pending). */
  globalBadges?: readonly GlobalBadgeStanding[];
  /** Per-edition achievements: live edition shows earned + pending; finished/past editions show earned only. */
  editions?: readonly EditionAchievementsGroup[];
}

const t = copy.achievements;
const formatDate = (at: Date) => new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: EDITION.timeZone }).format(new Date(at));

interface DisplayBadge {
  id: string;
  name: string;
  description: string;
  tone: BadgeTone;
  image: ImageRef | null;
}

interface DisplayStanding {
  badge: DisplayBadge;
  earnedAt: Date | null;
  current: number;
  target: number;
}

function EarnedGrid({
  items,
  emptyMessage,
  headingAs = "h4",
}: {
  items: readonly DisplayStanding[];
  emptyMessage: string;
  headingAs?: "h3" | "h4";
}) {
  if (items.length === 0) {
    return <p className="type-body-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const Heading = headingAs;
  return (
    <ul className="gap-space-3 grid grid-cols-1 min-[560px]:grid-cols-2">
      {items.map(({ badge, earnedAt }) => (
        <li key={badge.id}>
          <Card className="border-accent/50 gap-space-4 flex h-full items-center">
            <MedalArt tone={badge.tone} imageUrl={badge.image?.url} scale={3} className="shrink-0" />
            <div className="gap-space-1 flex min-w-0 flex-col">
              <Heading className="type-label text-foreground">{badge.name}</Heading>
              <p className="type-caption text-muted-foreground">{badge.description}</p>
              {earnedAt ? <p className="type-caption text-lime-ink">{interpolate(t.earnedOn, { date: formatDate(earnedAt) })}</p> : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function PendingGrid({
  items,
  allEarnedMessage,
  headingAs = "h4",
}: {
  items: readonly DisplayStanding[];
  allEarnedMessage: string;
  headingAs?: "h3" | "h4";
}) {
  if (items.length === 0) {
    return <p className="type-body-sm text-foreground">{allEarnedMessage}</p>;
  }
  const Heading = headingAs;
  return (
    <ul className="gap-space-3 grid grid-cols-1 min-[560px]:grid-cols-2">
      {items.map(({ badge, current, target }) => {
        const progress = interpolate(t.progress, { current: formatNumber(current), target: formatNumber(target) });
        return (
          <li key={badge.id}>
            <Card className="gap-space-4 flex h-full items-center">
              <MedalArt tone={badge.tone} imageUrl={badge.image?.url} locked scale={3} className="shrink-0" />
              <div className="gap-space-2 flex min-w-0 flex-1 flex-col">
                <div className="gap-space-1 flex flex-col">
                  <Heading className="type-label text-foreground">{badge.name}</Heading>
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
  );
}

/**
 * The Logros tab:
 * - Cross-edition mode (`globalBadges` + `editions`): shows always-active global community badges
 *   plus per-edition trophies (live edition shows earned + pending; finished/past editions show earned only).
 * - Legacy single-edition mode (`badges` only): shows earned and pending badges for one edition.
 */
export function AchievementsView({ badges, globalBadges, editions }: AchievementsViewProps) {
  const crossEdition = globalBadges !== undefined || editions !== undefined;

  if (!crossEdition) {
    const single = badges ?? [];
    const earned = single.filter((standing) => standing.earnedAt !== null);
    const pending = single.filter((standing) => standing.earnedAt === null);
    const summary = interpolate(t.summary, { earned: String(earned.length), total: String(single.length) });

    return (
      <div className="gap-space-6 flex flex-col">
        <header className="gap-space-2 flex flex-col">
          <h1 className="type-title text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </header>

        {single.length === 0 ? (
          <Card>
            <p className="type-body text-muted-foreground">{t.empty}</p>
          </Card>
        ) : (
          <>
            <Card className="gap-space-3 flex flex-col">
              <p className="type-label text-foreground">{summary}</p>
              <ProgressBar value={earned.length} max={single.length} label={t.summaryLabel} valueText={summary} />
            </Card>

            <section aria-labelledby="achievements-earned" className="gap-space-3 flex flex-col">
              <h2 id="achievements-earned" className="type-heading text-foreground">
                {t.earnedTitle}
              </h2>
              <EarnedGrid items={earned} emptyMessage={t.noneEarned} headingAs="h3" />
            </section>

            <section aria-labelledby="achievements-pending" className="gap-space-3 flex flex-col">
              <h2 id="achievements-pending" className="type-heading text-foreground">
                {t.pendingTitle}
              </h2>
              <PendingGrid items={pending} allEarnedMessage={t.allEarned} headingAs="h3" />
            </section>
          </>
        )}
      </div>
    );
  }

  const globals = globalBadges ?? [];
  const editionGroups = editions ?? [];
  const globalEarned = globals.filter((standing) => standing.earnedAt !== null);
  const globalPending = globals.filter((standing) => standing.earnedAt === null);
  const editionEarnedTotal = editionGroups.reduce(
    (sum, group) => sum + group.badges.filter((standing) => standing.earnedAt !== null).length,
    0,
  );
  const totalEarned = globalEarned.length + editionEarnedTotal;
  const totalLabel =
    totalEarned === 1
      ? t.totalEarnedOne
      : interpolate(t.totalEarnedMany, { earned: formatNumber(totalEarned) });
  const globalSummary = interpolate(t.summary, { earned: String(globalEarned.length), total: String(globals.length) });

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitleCrossEdition}</p>
      </header>

      <Card className="gap-space-3 flex flex-col">
        <p className="type-title text-foreground">{totalLabel}</p>
        {globals.length > 0 ? (
          <>
            <p className="type-caption text-muted-foreground">{`${t.globalSection.title}: ${globalSummary}`}</p>
            <ProgressBar value={globalEarned.length} max={globals.length} label={t.summaryLabel} valueText={globalSummary} />
          </>
        ) : null}
      </Card>

      {globals.length > 0 ? (
        <section aria-labelledby="achievements-global" className="gap-space-4 flex flex-col">
          <div className="gap-space-1 flex flex-col">
            <h2 id="achievements-global" className="type-heading text-foreground">
              {t.globalSection.title}
            </h2>
            <p className="type-body-sm text-muted-foreground">{t.globalSection.subtitle}</p>
          </div>

          <div className="gap-space-3 flex flex-col">
            <h3 className="type-label text-text-subtle uppercase tracking-wider">{t.earnedTitle}</h3>
            <EarnedGrid items={globalEarned} emptyMessage={t.noneEarnedGlobal} />
          </div>

          <div className="gap-space-3 flex flex-col">
            <h3 className="type-label text-text-subtle uppercase tracking-wider">{t.pendingTitle}</h3>
            <PendingGrid items={globalPending} allEarnedMessage={t.allEarnedGlobal} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="achievements-events" className="gap-space-5 flex flex-col">
        <div className="gap-space-1 flex flex-col">
          <h2 id="achievements-events" className="type-heading text-foreground">
            {t.eventsSection.title}
          </h2>
          <p className="type-body-sm text-muted-foreground">{t.eventsSection.subtitle}</p>
        </div>

        {editionGroups.length === 0 ? (
          <Card>
            <p className="type-body-sm text-muted-foreground">{t.eventsSection.emptyPast}</p>
          </Card>
        ) : (
          editionGroups.map((group) => {
            const earned = group.badges.filter((standing) => standing.earnedAt !== null);
            const pending = group.isLive ? group.badges.filter((standing) => standing.earnedAt === null) : [];
            const earnedCaption =
              earned.length === 1
                ? t.eventsSection.earnedCountOne
                : interpolate(t.eventsSection.earnedCountMany, { n: formatNumber(earned.length) });
            const liveSummary = interpolate(t.summary, { earned: String(earned.length), total: String(group.badges.length) });

            return (
              <div key={group.eventId} className="gap-space-4 flex flex-col">
                <div className="gap-space-2 flex flex-wrap items-center justify-between">
                  <div className="gap-space-2 flex flex-wrap items-center">
                    <h3 className="type-title text-foreground">{group.eventName}</h3>
                    <span
                      className={cn(
                        "type-caption rounded-pill border px-2.5 py-0.5 font-semibold",
                        group.isLive ? "border-accent text-lime-ink" : "border-line-strong text-text-subtle",
                      )}
                    >
                      {group.isLive ? t.eventsSection.liveBadge : t.eventsSection.finishedBadge}
                    </span>
                  </div>
                  <span className="type-caption text-muted-foreground">{group.isLive ? liveSummary : earnedCaption}</span>
                </div>

                {group.isLive ? (
                  group.badges.length === 0 ? (
                    <Card>
                      <p className="type-body text-muted-foreground">{t.empty}</p>
                    </Card>
                  ) : (
                    <>
                      <div className="gap-space-3 flex flex-col">
                        <p className="type-label text-text-subtle uppercase tracking-wider">{t.earnedTitle}</p>
                        <EarnedGrid items={earned} emptyMessage={t.noneEarned} />
                      </div>
                      <div className="gap-space-3 flex flex-col">
                        <p className="type-label text-text-subtle uppercase tracking-wider">{t.pendingTitle}</p>
                        <PendingGrid items={pending} allEarnedMessage={t.allEarned} />
                      </div>
                    </>
                  )
                ) : (
                  <EarnedGrid items={earned} emptyMessage={t.noneEarnedFinished} />
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
