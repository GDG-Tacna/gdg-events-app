import "server-only";
import { ok, type Result } from "@/shared/lib/result";
import type { EditionLayout, QuadrantSource } from "../../domain/ports";

export interface CachedSourceOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * The edition's quadrants and plan, kept in memory for a short time: every map view needs them and they
 * change rarely (two reads saved per view when the whole venue opens the map at once). A failed read is
 * never cached. Admin changes call `invalidate()` (phase 3, module 4).
 */
export class CachedQuadrantSource implements QuadrantSource {
  private cached: { layout: EditionLayout; expiresAt: number } | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly source: QuadrantSource,
    { ttlMs = 60_000, now = Date.now }: CachedSourceOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async load(): Promise<Result<EditionLayout, { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.layout);

    const loaded = await this.source.load();
    if (!loaded.ok) return loaded;
    this.cached = { layout: loaded.value, expiresAt: this.now() + this.ttlMs };
    return loaded;
  }

  /** Drops the cached layout, so the next read sees an admin's change at once (on this server instance). */
  invalidate(): void {
    this.cached = null;
  }
}
