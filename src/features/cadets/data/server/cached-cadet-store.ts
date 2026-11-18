import "server-only";
import { getActiveEventId } from "@/shared/lib/firebase/active-event";
import { ttlCached, type TtlCachedRead } from "@/shared/lib/ttl-cache";
import type { CadetStore, IndexedCadet } from "../../domain/manage";

type EveryCadet = { cadets: readonly IndexedCadet[]; total: number };

export interface CachedCadetStoreOptions {
  ttlMs?: number;
  now?: () => number;
  /** The edition whose cadets are kept: one copy each, so a draft never shows the public edition's cadets. */
  key?: () => Promise<string>;
}

/**
 * Keeps the whole list of cadets (the one a search reads) in this server instance's memory for a minute, so a few
 * searches in a row share one read of every participant instead of paying it each time. Every change made through this
 * store drops the kept list at once; a cadet who registers in that minute shows up in the next search after it. Only
 * the whole list is kept: pages, a single cadet and every change go straight to the store.
 */
export class CachedCadetStore implements CadetStore {
  private readonly everyone: TtlCachedRead<EveryCadet, { code: string }>;

  constructor(
    private readonly inner: CadetStore,
    { ttlMs = 60_000, now, key = getActiveEventId }: CachedCadetStoreOptions = {},
  ) {
    this.everyone = ttlCached(() => inner.listAll(), { ttlMs, now, key });
  }

  list: CadetStore["list"] = (query) => this.inner.list(query);
  get: CadetStore["get"] = (uid) => this.inner.get(uid);
  listAll: CadetStore["listAll"] = () => this.everyone();

  rename: CadetStore["rename"] = async (uid, alias) => this.forgetAfter(await this.inner.rename(uid, alias));
  setSquad: CadetStore["setSquad"] = async (uid, squad) => this.forgetAfter(await this.inner.setSquad(uid, squad));
  setBan: CadetStore["setBan"] = async (uid, ban) => this.forgetAfter(await this.inner.setBan(uid, ban));
  remove: CadetStore["remove"] = async (uid) => this.forgetAfter(await this.inner.remove(uid));

  /** A change that went through (or may have, partly) makes the kept list stale; a plain failure leaves it as it was. */
  private forgetAfter<T extends { ok: boolean }>(result: T): T {
    if (result.ok) this.everyone.clear();
    return result;
  }
}
