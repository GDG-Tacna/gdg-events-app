"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { percentOf, type PollTally } from "../domain/poll";
import type { StagePollAction, StagePollView } from "./actions";

const t = copy.stage.poll;

/** A poll's results in projector type: the question, each option's bar and share, and how many voted. */
export function PollStageView({ poll, tally }: { poll: StagePollView; tally: PollTally }) {
  const reduce = useReducedMotion();
  const leader = Math.max(0, ...poll.options.map((option) => tally.counts[option.id] ?? 0));
  return (
    <section aria-label={t.label} className="flex flex-1 flex-col gap-[3vh]">
      <div className="flex flex-col gap-[1vh]">
        <p className="text-primary text-[clamp(0.9rem,2.2vh,1.8rem)] font-semibold tracking-widest uppercase">{poll.status === "open" ? t.live : t.closed}</p>
        <h2 className="font-display text-[clamp(1.75rem,5.5vh,5rem)] leading-tight font-bold">{poll.question}</h2>
      </div>
      <ul className="flex flex-col gap-[2.2vh]">
        {poll.options.map((option) => {
          const count = tally.counts[option.id] ?? 0;
          const percent = percentOf(tally, option.id);
          const leading = count > 0 && count === leader;
          return (
            <li key={option.id} className="flex flex-col gap-[0.8vh]">
              <div className="flex items-center gap-[1.5vw]">
                {/* The projector draws the app's own stored image as is, like the stage background. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {option.imageUrl ? <img src={option.imageUrl} alt="" className="size-[7vh] shrink-0 rounded-md object-cover" /> : null}
                <span className="min-w-0 flex-1 text-[clamp(1.1rem,3.4vh,3rem)] font-semibold">{option.text}</span>
                <span className="font-display text-[clamp(1.2rem,4vh,3.5rem)] font-bold tabular-nums">{percent}%</span>
              </div>
              <div aria-hidden="true" className="bg-surface-raised h-[2.2vh] min-h-3 overflow-hidden rounded-full">
                <motion.div
                  className={leading ? "bg-accent h-full rounded-full" : "bg-primary h-full rounded-full"}
                  initial={false}
                  animate={{ width: `${percent}%` }}
                  transition={reduce ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-[clamp(1rem,2.6vh,2.25rem)]" aria-live="polite">
        {tally.total === 1 ? t.oneVote : interpolate(t.votes, { n: String(tally.total) })}
      </p>
    </section>
  );
}

/**
 * A poll's live results on the stage: asked to the server every few seconds while it is on screen (the projector's
 * browser cannot read polls itself). A failed refresh keeps the last numbers; nothing shows until the first answer.
 */
export function LivePollStage({ pollId, load, every = 3000 }: { pollId: string; load: StagePollAction; every?: number }) {
  const [shown, setShown] = useState<{ poll: StagePollView; tally: PollTally } | null>(null);

  useEffect(() => {
    let stopped = false;
    const ask = () =>
      void load({ id: pollId })
        .then((result) => {
          if (!stopped && result.ok) setShown({ poll: result.poll, tally: result.tally });
        })
        .catch(() => undefined);
    ask();
    const timer = setInterval(ask, every);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pollId, load, every]);

  return shown ? <PollStageView poll={shown.poll} tally={shown.tally} /> : null;
}
