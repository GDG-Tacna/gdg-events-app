"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import type { CodeLanguage, Difficulty } from "../../domain/catalog";

/** What every game receives from the frame. A game only ever reports won or lost, once. */
export interface GameProps {
  difficulty: Difficulty;
  codeLanguages: readonly CodeLanguage[];
  /** True while the tab is hidden or the pause screen is up: the game must stand still. */
  paused: boolean;
  onFinish: (won: boolean) => void;
  /** Randomness, replaceable in tests. */
  random?: () => number;
}

const TICK_MS = 100;

/**
 * Seconds left of a game's time limit, counting only while it is not paused, and `onExpire` once when it
 * runs out. Counted in ticks, so a paused or hidden tab never loses time.
 */
export function useGameClock(limitSeconds: number, paused: boolean, onExpire: () => void): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  const expired = useRef(false);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setElapsedMs((current) => current + TICK_MS), TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (!expired.current && elapsedMs >= limitSeconds * 1000) {
      expired.current = true;
      expire.current();
    }
  }, [elapsedMs, limitSeconds]);

  return Math.max(0, Math.ceil(limitSeconds - elapsedMs / 1000));
}

/** Calls `onFinish` only the first time: a game can end by time and by a last move in the same instant. */
export function useFinishOnce(onFinish: (won: boolean) => void) {
  const done = useRef(false);
  const latest = useRef(onFinish);
  useEffect(() => {
    latest.current = onFinish;
  });
  // Stable, so a game loop that depends on it does not restart on every render.
  return useCallback((won: boolean) => {
    if (done.current) return;
    done.current = true;
    latest.current(won);
  }, []);
}

/** The game's bar: time left and one counter (lives, mistakes or hits). */
export function GameHud({ secondsLeft, counter }: { secondsLeft: number; counter?: { label: string; value: string } }) {
  return (
    <div className="gap-space-3 flex items-center justify-between">
      <p className="type-pixel-tag text-primary" role="timer" aria-label={copy.minigames.hud.timeLabel}>
        {interpolate(copy.minigames.hud.time, { n: String(secondsLeft) })}
      </p>
      {counter ? (
        <p className="type-label text-foreground">
          {counter.label}: <span className="tabular-nums">{counter.value}</span>
        </p>
      ) : null}
    </div>
  );
}
