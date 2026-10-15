import "server-only";
import { ok, type Result } from "@/shared/lib/result";
import type { RankingEntry, RankingSource } from "../../domain/ranking";

export interface CachedRankingOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * The ranking reads every cadet's dashboard shares (the top, the number of cadets, the squad totals), kept in
 * memory for a few seconds: with the whole venue opening the app at once, each server instance reads them once
 * per window instead of once per visit. A cadet's own place is never cached. A failed read is never cached.
 */
export class CachedRankingSource implements RankingSource {
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly source: RankingSource,
    { ttlMs = 10_000, now = Date.now }: CachedRankingOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  private async remember<T>(key: string, read: () => Promise<Result<T, { code: string }>>): Promise<Result<T, { code: string }>> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return ok(hit.value as T);
    const result = await read();
    if (result.ok) this.cache.set(key, { value: result.value, expiresAt: this.now() + this.ttlMs });
    return result;
  }

  top(limit: number): Promise<Result<readonly RankingEntry[], { code: string }>> {
    return this.remember(`top:${limit}`, () => this.source.top(limit));
  }

  placeOf(uid: string) {
    return this.source.placeOf(uid);
  }

  total(): Promise<Result<number, { code: string }>> {
    return this.remember("total", () => this.source.total());
  }

  squadTotals(squadIds: readonly string[]): Promise<Result<ReadonlyMap<string, { xp: number; members: number }>, { code: string }>> {
    return this.remember(`squads:${[...squadIds].sort().join(",")}`, () => this.source.squadTotals(squadIds));
  }
}
