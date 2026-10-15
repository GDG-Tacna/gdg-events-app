import "server-only";
import { currentEditionOf } from "@/features/event/server";

/** Every per-edition cache, so a whole edition's copies can be dropped at once (after copying content into it). */
const registry = new Set<Map<string, unknown>>();

/** Forgets what every cache keeps for one edition; the next read builds a fresh copy. */
export function dropEditionCaches(eventId: string): void {
  for (const copies of registry) copies.delete(eventId);
}

/** Methods that drop kept data: they reach every edition's copy at once (cheap, and an admin change is rare). */
const INVALIDATORS = new Set<PropertyKey>(["invalidate", "clear"]);

/**
 * One copy of an in-memory cache per edition. The caches were written for a single edition; with a control center
 * working on a draft while cadets use the public edition, each edition keeps its own copy so one never shows the
 * other's data. Every other method is async on these caches and is sent to the copy of the edition the request
 * resolves to (the same resolver their adapters use).
 */
export function perEdition<T extends object>(make: () => T, editionOf: () => Promise<string> = currentEditionOf): T {
  const copies = new Map<string, T>();
  registry.add(copies);
  const copyFor = async () => {
    const eventId = await editionOf();
    let copy = copies.get(eventId);
    if (!copy) {
      copy = make();
      copies.set(eventId, copy);
    }
    return copy;
  };

  return new Proxy({} as T, {
    get(_target, property) {
      // Never look like a promise (an `await` on the cache itself must not call into it).
      if (property === "then" || typeof property === "symbol") return undefined;
      if (INVALIDATORS.has(property)) {
        return () => {
          for (const copy of copies.values()) (copy as Record<PropertyKey, () => void>)[property]?.();
        };
      }
      return async (...args: unknown[]) => {
        const copy = (await copyFor()) as Record<PropertyKey, (...rest: unknown[]) => unknown>;
        return copy[property](...args);
      };
    },
  });
}
