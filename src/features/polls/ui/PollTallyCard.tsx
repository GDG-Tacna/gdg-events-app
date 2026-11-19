"use client";

import { useEffect, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Card, ProgressBar, Thumbnail } from "@/shared/ui";
import { percentOf, type Poll, type PollTally } from "../domain/poll";
import type { PollTallyAction } from "./actions";

const t = copy.poll.results;

export interface PollTallyCardProps {
  poll: Poll;
  tally: PollTally;
  /** The option this cadet voted, marked in the list. */
  myVote: string | null;
  /** Asked again every few seconds while the poll is open. */
  refresh: PollTallyAction;
  /** Milliseconds between refreshes. */
  every?: number;
}

/** How many votes, in words ("1 voto", "12 votos"). */
const votesLabel = (total: number) => (total === 1 ? t.oneVote : interpolate(t.total, { n: String(total) }));

/**
 * How the poll's votes stand, for a cadet who voted: each option's votes and share, the leading one highlighted and the
 * cadet's own marked. It refreshes on its own while the poll is open; a failed refresh keeps the last numbers, and once
 * the server says the poll closed it stops and says so. `tally` only seeds it: to show a fresher count (after a vote),
 * remount it with a new `key`.
 */
export function PollTallyCard({ poll, tally: initial, myVote, refresh, every = 10_000 }: PollTallyCardProps) {
  const [tally, setTally] = useState(initial);
  const [closed, setClosed] = useState(false);
  const live = !closed && poll.status === "open";

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const timer = setInterval(() => {
      void refresh({ pollId: poll.id })
        .then((result) => {
          if (stopped) return;
          if (result.ok) setTally(result.tally);
          else if (result.code === "closed") setClosed(true);
        })
        .catch(() => undefined);
    }, every);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, refresh, poll.id, every]);

  const leader = Math.max(0, ...poll.options.map((option) => tally.counts[option.id] ?? 0));

  return (
    <Card className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <h2 className="type-heading text-foreground">{t.title}</h2>
        <p className="type-body-sm text-muted-foreground" aria-live="polite">
          {votesLabel(tally.total)} · {live ? t.live : t.closed}
        </p>
      </div>
      <ul aria-label={t.listLabel} className="gap-space-4 flex flex-col">
        {poll.options.map((option) => {
          const count = tally.counts[option.id] ?? 0;
          const percent = percentOf(tally, option.id);
          const leading = count > 0 && count === leader;
          const countText = interpolate(t.count, { count: votesLabel(count), percent: String(percent) });
          return (
            <li key={option.id} className="gap-space-2 flex flex-col">
              <div className="gap-space-3 flex items-center">
                {option.image ? <Thumbnail url={option.image.url} size={40} /> : null}
                <span className="gap-space-2 flex min-w-0 flex-1 flex-wrap items-center">
                  <span className={cn("type-label", leading ? "text-lime-ink" : "text-foreground")}>{option.text}</span>
                  {option.id === myVote ? <span className="type-caption text-cyan-ink">{t.yourVoteTag}</span> : null}
                </span>
                <span className="type-body-sm text-muted-foreground tabular-nums">{countText}</span>
              </div>
              <ProgressBar value={percent} label={option.text} valueText={countText} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
