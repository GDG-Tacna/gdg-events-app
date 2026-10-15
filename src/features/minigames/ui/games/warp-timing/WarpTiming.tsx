"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, PixelShip } from "@/shared/ui";
import { GameHud, useFinishOnce, useGameClock, type GameProps } from "../shared";
import { JUMPS, TIME_LIMIT_SECONDS, WARP_CONFIG, isHit, jumpParams, markerAt, outcome, zoneCenter } from "./logic";

/** A stable default, so effects that depend on the clock do not restart on every render. */
const performanceNow = () => performance.now();

export interface WarpTimingProps extends GameProps {
  /** Milliseconds now, replaceable in tests. */
  now?: () => number;
}

/**
 * "Salto en el momento justo": the marker swings across the bar; "Saltar" while it is in the green zone is a
 * hit. Where the marker is at the tap comes from the time, not from what is drawn, so a slow screen is fair.
 */
export function WarpTiming({ difficulty, paused, onFinish, random = Math.random, now = performanceNow }: WarpTimingProps) {
  const t = copy.minigames.warp;
  const config = WARP_CONFIG[difficulty];
  const finish = useFinishOnce(onFinish);
  const [jump, setJump] = useState(0);
  const [hits, setHits] = useState(0);
  const [center, setCenter] = useState(() => zoneCenter(jumpParams(config, 0).zone, random()));
  const [feedback, setFeedback] = useState<"hit" | "miss" | null>(null);
  const [position, setPosition] = useState(0);
  // When the current jump started (set on the first effect, never during render).
  const started = useRef<number | null>(null);
  const pausedAt = useRef<number | null>(null);
  const secondsLeft = useGameClock(TIME_LIMIT_SECONDS, paused, () => finish(false));
  const { speed, zone } = jumpParams(config, jump);

  useEffect(() => {
    if (started.current === null) started.current = now();
  }, [now]);

  const elapsed = useCallback(() => (now() - (started.current ?? now())) / 1000, [now]);

  // A pause freezes the marker: the time spent paused is added to the jump's start.
  useEffect(() => {
    if (paused) pausedAt.current = now();
    else if (pausedAt.current !== null) {
      if (started.current !== null) started.current += now() - pausedAt.current;
      pausedAt.current = null;
    }
  }, [paused, now]);

  // Draws the marker; the game itself never depends on these frames.
  useEffect(() => {
    if (paused || typeof requestAnimationFrame !== "function") return;
    let frame = requestAnimationFrame(function draw() {
      setPosition(markerAt(elapsed(), speed));
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [paused, speed, elapsed]);

  function leap() {
    if (paused) return;
    const at = markerAt(elapsed(), speed);
    const hit = isHit(at, center, zone);
    const nextHits = hits + (hit ? 1 : 0);
    const decided = outcome(nextHits, jump + 1, config.needed);
    setHits(nextHits);
    setFeedback(hit ? "hit" : "miss");
    if (decided !== null) {
      finish(decided);
      return;
    }
    const next = jump + 1;
    setJump(next);
    setCenter(zoneCenter(jumpParams(config, next).zone, random()));
    started.current = now();
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <GameHud secondsLeft={secondsLeft} counter={{ label: t.hitsLabel, value: `${hits}/${config.needed}` }} />
      <div className="gap-space-3 flex flex-col items-center">
        <PixelShip scale={4} />
        <div role="img" aria-label={t.barLabel} className="bg-bg-deep border-line-strong relative h-10 w-full overflow-hidden rounded-md border">
          <div className="bg-accent/40 border-accent absolute inset-y-0 border-x-2" style={{ left: `${(center - zone / 2) * 100}%`, width: `${zone * 100}%` }} />
          <div className="bg-primary absolute inset-y-0 w-1.5 -translate-x-1/2" style={{ left: `${position * 100}%` }} />
        </div>
        <p className="type-caption text-text-subtle">{interpolate(t.jumpOf, { n: String(Math.min(jump + 1, JUMPS)) })}</p>
        <p aria-live="polite" className={cn("type-label min-h-6", feedback === "hit" ? "text-accent" : "text-muted-foreground")}>
          {feedback === "hit" ? t.hit : feedback === "miss" ? t.miss : ""}
        </p>
      </div>
      <Button size="lg" block onClick={leap} disabled={paused}>
        {t.jump}
      </Button>
    </div>
  );
}
