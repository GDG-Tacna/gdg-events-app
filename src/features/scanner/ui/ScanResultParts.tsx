"use client";

import { animate, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ScanProgress } from "@/features/checkins";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Icon, RankChip } from "@/shared/ui";

/** A number that counts up from 0 to `to` after `delay` seconds (it is simply there under reduced motion). */
function useCountUp(to: number, delay: number, reduce: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, to, { duration: 0.7, delay, ease: "easeOut", onUpdate: (latest) => setValue(Math.round(latest)) });
    return () => controls.stop();
  }, [to, delay, reduce]);
  return reduce ? to : value;
}

/**
 * The mark of the result: a success draws its circle and check stroke by stroke, a problem shakes once. Under reduced
 * motion it is drawn at once.
 */
export function ResultIcon({ ok, reduce }: { ok: boolean; reduce: boolean }) {
  if (!ok) {
    return (
      <motion.span
        aria-hidden="true"
        className="text-danger-ink inline-grid size-12 shrink-0 place-items-center"
        animate={reduce ? undefined : { x: [0, -6, 6, -4, 4, 0] }}
        transition={{ duration: 0.4 }}
      >
        <Icon name="alert" size={40} />
      </motion.span>
    );
  }
  const draw = (delay: number, duration: number) => ({
    initial: reduce ? false : { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: { duration, delay: reduce ? 0 : delay, ease: "easeOut" as const },
  });
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="text-lime-ink size-12 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <motion.circle cx={24} cy={24} r={21} {...draw(0, 0.4)} />
      <motion.path d="M14 25l7 7 13-15" {...draw(0.35, 0.3)} />
    </svg>
  );
}

/**
 * The XP the scan gave, counting up, over the bar filling from where it was to where it is now. A rank-up fills the bar
 * to the end and then announces the new rank with a pop. The bar is also exposed as a progress bar for screen readers.
 */
export function XpProgress({ progress, delay, barDelay, rankDelay, reduce }: { progress: ScanProgress; delay: number; barDelay: number; rankDelay: number; reduce: boolean }) {
  const t = copy.scanner;
  const gained = useCountUp(progress.xpGained, delay, reduce);
  return (
    <div className="gap-space-2 flex flex-col">
      <motion.p className="type-pixel-tag text-lime-ink" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : delay, duration: 0.25 }}>
        {interpolate(t.xpGained, { n: formatNumber(gained) })}
      </motion.p>
      <div role="progressbar" aria-label={t.xpBar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.to.percent} className="bg-surface-raised border-ink h-3 overflow-hidden rounded-full border-2">
        <motion.div
          className="bg-gold h-full rounded-full"
          initial={reduce ? false : { width: `${progress.from.percent}%` }}
          animate={{ width: `${progress.rankUp ? 100 : progress.to.percent}%` }}
          transition={{ duration: 0.9, delay: reduce ? 0 : barDelay, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <RankChip level={progress.to.level} name={progress.to.name} className="self-start" />
      {progress.rankUp ? (
        <motion.p
          role="status"
          className="type-label text-gold-ink gap-space-2 flex items-center"
          initial={reduce ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 14, delay: reduce ? 0 : rankDelay }}
        >
          <Icon name="trophy" size={20} />
          {t.rankUp}
        </motion.p>
      ) : null}
    </div>
  );
}
