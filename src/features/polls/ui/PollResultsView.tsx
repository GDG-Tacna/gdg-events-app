"use client";

import { useEffect, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, ProgressBar, Thumbnail } from "@/shared/ui";
import { percentOf, type Poll, type PollTally } from "../domain/poll";
import type { PollResultsAction } from "./actions";

export interface PollResultsViewProps {
  poll: Poll;
  tally: PollTally;
  /** Asked again every few seconds while the poll is open. */
  refresh: PollResultsAction;
  listHref: string;
  /** Milliseconds between refreshes. */
  every?: number;
}

const t = copy.admin.polls;
const r = t.resultsView;

/** How many votes, in words ("1 voto", "12 votos"). */
export const votesLabel = (total: number) => (total === 1 ? r.oneVote : interpolate(r.total, { n: String(total) }));

/** A poll's results: each option's votes and share. While the poll is open they refresh on their own. */
export function PollResultsView({ poll, tally: initial, refresh, listHref, every = 4000 }: PollResultsViewProps) {
  const [tally, setTally] = useState(initial);
  const live = poll.status === "open";

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // A failed refresh keeps the last numbers on screen; the next one tries again.
      void refresh({ id: poll.id })
        .then((result) => {
          if (result.ok) setTally(result.tally);
        })
        .catch(() => undefined);
    }, every);
    return () => clearInterval(timer);
  }, [live, refresh, poll.id, every]);

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.form.back}
        </ButtonLink>
      </div>
      <div className="gap-space-1 flex flex-col">
        <p className="type-caption text-text-subtle">
          {r.title} · {t.status[poll.status]}
        </p>
        <h1 className="type-title-xl text-foreground">{poll.question}</h1>
        <p className="type-body text-muted-foreground" aria-live="polite">
          {votesLabel(tally.total)}
          {live ? ` · ${r.live}` : null}
        </p>
      </div>
      <Card>
        <ul aria-label={r.listLabel} className="gap-space-4 flex flex-col">
          {poll.options.map((option) => {
            const count = tally.counts[option.id] ?? 0;
            const percent = percentOf(tally, option.id);
            return (
              <li key={option.id} className="gap-space-2 flex flex-col">
                <div className="gap-space-3 flex items-center">
                  {option.image ? <Thumbnail url={option.image.url} size={40} /> : null}
                  <span className="type-label text-foreground min-w-0 flex-1">{option.text}</span>
                  <span className="type-body-sm text-muted-foreground tabular-nums">{interpolate(r.count, { count: String(count), percent: String(percent) })}</span>
                </div>
                <ProgressBar value={percent} label={option.text} valueText={interpolate(r.count, { count: String(count), percent: String(percent) })} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
