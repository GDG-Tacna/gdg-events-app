"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Icon } from "@/shared/ui";
import { BoardSummary } from "./BoardSummary";

/** How long the celebration stays in the address before the page cleans it, so a refresh does not replay it. */
const CLEAN_URL_AFTER_MS = 4000;

/**
 * The card of a mission the cadet just completed (the scanner sends them here): it pops in with a stamp, and the
 * first one carries the screen's single glow and is scrolled into view. Under reduced motion nothing moves: the
 * stamp is simply there.
 */
export function CelebratedCard({ first, children }: { first: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (first) ref.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [first, reduce]);

  return (
    <motion.div
      ref={ref}
      className="relative h-full"
      initial={reduce ? false : { scale: 0.94, opacity: 0.6 }}
      animate={reduce ? undefined : { scale: [0.94, 1.04, 1], opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
      {first ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg shadow-[var(--shadow-glow-gold)]"
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: [0, 1, 0.45] }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      ) : null}
      <motion.span
        aria-hidden="true"
        className="type-caption bg-accent text-on-accent gap-space-1 px-space-3 absolute -top-3 right-3 z-10 inline-flex items-center rounded-full py-1 font-semibold"
        initial={reduce ? false : { scale: 0, rotate: -12 }}
        animate={reduce ? undefined : { scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.35 }}
      >
        <Icon name="check" size={14} />
        {copy.missions.celebratedTag}
      </motion.span>
    </motion.div>
  );
}

/** A number that counts from `from` to `to` (instant under reduced motion). */
function useCountUp(from: number, to: number, reduce: boolean): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(from, to, { duration: 0.9, delay: 0.5, ease: "easeOut", onUpdate: (latest) => setValue(Math.round(latest)) });
    return () => controls.stop();
  }, [from, to, reduce]);
  return reduce ? to : value;
}

export interface CelebratedSummaryProps {
  done: number;
  total: number;
  xp: number;
  credits: number;
  /** What the celebrated missions added, so the counters start from before them. */
  gained: { missions: number; xp: number; credits: number };
  titles: readonly string[];
}

/**
 * The board's summary right after a scan: the missions, XP and G-Credits count up from what the cadet had before the
 * scan and the bar grows to the new total. A polite live region names each mission for screen readers, and the
 * address is cleaned after a few seconds.
 */
export function CelebratedSummary({ done, total, xp, credits, gained, titles }: CelebratedSummaryProps) {
  const reduce = useReducedMotion() ?? false;
  const router = useRouter();
  const pathname = usePathname();
  const shownDone = useCountUp(done - gained.missions, done, reduce);
  const shownXp = useCountUp(xp - gained.xp, xp, reduce);
  const shownCredits = useCountUp(credits - gained.credits, credits, reduce);

  useEffect(() => {
    const timer = setTimeout(() => router.replace(pathname, { scroll: false }), CLEAN_URL_AFTER_MS);
    return () => clearTimeout(timer);
  }, [router, pathname]);

  return (
    <>
      <div role="status" className="sr-only">
        {titles.map((title) => (
          <p key={title}>{interpolate(copy.missions.celebrated, { title })}</p>
        ))}
      </div>
      <BoardSummary done={shownDone} total={total} xp={shownXp} credits={shownCredits} />
    </>
  );
}
