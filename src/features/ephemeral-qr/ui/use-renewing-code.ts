"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Ask for the next code this long before the current one ends, so the screen never shows a dead code. */
export const REFRESH_BEFORE_MS = 25_000;
/** Do not hammer the server while it is failing. */
const RETRY_EVERY_MS = 4_000;

/** Anything with a life: when the server made it and when it stops working, both on the server's clock. */
export interface TimedCode {
  issuedAt: number;
  expiresAt: number;
}

export type RenewingState<V extends TimedCode, E extends string> =
  | { status: "loading" }
  | {
      status: "showing";
      code: V;
      /** Milliseconds left, measured against the server's clock. */
      remainingMs: number;
      /** A refresh failed: the current code stays up until it ends. */
      reconnecting: boolean;
    }
  /** The last code ended and the next one has not arrived yet. */
  | { status: "expired" }
  | { status: "error"; code: E };

interface Current<V extends TimedCode> {
  value: V;
  /** Server clock minus device clock when the code arrived: removes a wrong device clock from the countdown. */
  offset: number;
}

/**
 * Keeps a fresh code on screen: asks for the first one, counts down against the server's clock and asks
 * for the next one shortly before the current one ends. An overlap is harmless (both are valid), a gap is
 * not. A temporary failure (`transient`) keeps the current code up; any other failure (the talk was closed,
 * the session ended) stops and says why.
 *
 * `request` and `now` must keep the same identity between renders (wrap `request` in `useCallback`): a new
 * function would restart the countdown.
 */
export function useRenewingCode<V extends TimedCode, E extends string>(
  request: () => Promise<{ ok: true; value: V } | { ok: false; code: E }>,
  transient: E,
  now: () => number = Date.now,
) {
  const [current, setCurrent] = useState<Current<V> | null>(null);
  const [error, setError] = useState<E | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [clock, setClock] = useState(() => now());

  const inFlight = useRef(false);
  const lastAttempt = useRef(0);
  const stopped = useRef(false);
  const currentRef = useRef<Current<V> | null>(null);

  const ask = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    lastAttempt.current = now();

    let result: { ok: true; value: V } | { ok: false; code: E };
    try {
      result = await request();
    } catch {
      result = { ok: false, code: transient };
    }
    inFlight.current = false;

    if (result.ok) {
      const next = { value: result.value, offset: result.value.issuedAt - now() };
      currentRef.current = next;
      setCurrent(next);
      setError(null);
      setReconnecting(false);
      return;
    }

    // Only a transient failure with a code still on screen is worth riding out.
    const live = currentRef.current;
    const stillAlive = live !== null && live.value.expiresAt - (now() + live.offset) > 0;
    if (result.code === transient && stillAlive) {
      setReconnecting(true);
      return;
    }
    if (result.code === transient) {
      // Nothing on screen and the server is failing: keep trying quietly, and show the error meanwhile.
      setError(transient);
      return;
    }
    stopped.current = true;
    currentRef.current = null;
    setCurrent(null);
    setError(result.code);
  }, [request, transient, now]);

  // First code. Started from a timer, not from the effect body, so the screen paints its loading state first.
  useEffect(() => {
    stopped.current = false;
    const first = setTimeout(() => void ask(), 0);
    return () => {
      clearTimeout(first);
      stopped.current = true;
    };
  }, [ask]);

  // The countdown, and the refresh shortly before the end.
  useEffect(() => {
    const timer = setInterval(() => {
      const tick = now();
      setClock(tick);

      if (stopped.current || inFlight.current || tick - lastAttempt.current < RETRY_EVERY_MS) return;
      const live = currentRef.current;
      const remaining = live ? live.value.expiresAt - (tick + live.offset) : 0;
      if (!live || remaining <= REFRESH_BEFORE_MS) void ask();
    }, 1000);
    return () => clearInterval(timer);
  }, [ask, now]);

  const retry = useCallback(() => {
    stopped.current = false;
    setError(null);
    void ask();
  }, [ask]);

  let state: RenewingState<V, E>;
  if (error !== null && (current === null || error !== transient)) {
    state = { status: "error", code: error };
  } else if (current === null) {
    state = { status: "loading" };
  } else {
    const remainingMs = current.value.expiresAt - (clock + current.offset);
    state =
      remainingMs > 0
        ? { status: "showing", code: current.value, remainingMs, reconnecting }
        : { status: "expired" };
  }

  return { state, retry };
}
