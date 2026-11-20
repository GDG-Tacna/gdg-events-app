"use client";

import { useEffect, useState } from "react";

/** How long a search box waits after the last key before it asks. */
export const SEARCH_PAUSE_MS = 300;

/**
 * The value, but only after it stopped changing for `delayMs`: a search box asks the server once the person pauses
 * typing instead of on every key. The first render returns the value as it is, so nothing waits on mount.
 */
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_PAUSE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
