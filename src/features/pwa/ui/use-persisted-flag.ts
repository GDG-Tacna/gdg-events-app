"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
/** Used when the browser blocks storage (private mode, blocked site data): the flag lasts for the page. */
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return memory.get(key) ?? false;
  }
}

function write(key: string): void {
  memory.set(key, true);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage is blocked: the in-memory flag is enough for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // another tab dismissed it
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A per-viewer yes/no kept in localStorage (a convenience, never state that matters). The server and the
 * first client render report it as set, so nothing flashes in before the real value is known.
 */
export function usePersistedFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => true,
  );
  const set = useCallback(() => write(key), [key]);
  return [value, set];
}
