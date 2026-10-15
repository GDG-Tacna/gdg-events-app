import type { Result } from "./result";

export interface TtlCacheOptions {
  ttlMs?: number;
  now?: () => number;
  /** Keeps one answer per key (the request's edition): a draft being prepared never shows the public edition's data. */
  key?: () => Promise<string>;
}

export interface TtlCachedRead<T, E> {
  (): Promise<Result<T, E>>;
  /** Drops the kept answer, so the next call reads again (after a save on this server instance). */
  clear(): void;
}

/**
 * Keeps a successful read in this server instance's memory for a short time, so many visits share one Firestore
 * read. Failures are never kept. Each instance keeps its own copy: use it only for what a screen shows, never for a
 * decision that must see the latest value (a draw, starting a play, a redemption).
 */
/** Every keyed cache, so one key (an edition) can be dropped from all of them at once. */
const keyed = new Set<Map<string, unknown>>();

/** Forgets one key in every keyed cache (after an edition's content changes in bulk). */
export function forgetCachedKey(key: string): void {
  for (const kept of keyed) kept.delete(key);
}

export function ttlCached<T, E>(load: () => Promise<Result<T, E>>, { ttlMs = 60_000, now = Date.now, key }: TtlCacheOptions = {}): TtlCachedRead<T, E> {
  const kept = new Map<string, { value: Result<T, E>; expiresAt: number }>();
  if (key) keyed.add(kept);
  const read = async () => {
    const slot = key ? await key() : "";
    const hit = kept.get(slot);
    if (hit && hit.expiresAt > now()) return hit.value;
    const value = await load();
    if (value.ok) kept.set(slot, { value, expiresAt: now() + ttlMs });
    return value;
  };
  return Object.assign(read, {
    clear: () => kept.clear(),
  });
}
