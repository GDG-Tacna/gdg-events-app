import "server-only";
import { ok, type Result } from "@/shared/lib/result";
import type { Mission } from "../../domain/mission";
import type { MissionSource } from "../../domain/ports";

export interface CachedSourceOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * The edition's missions, kept in memory for a short time: every board view and every answer needs
 * them, and they change rarely. A failed read is never cached. Admin changes call `invalidate()`.
 */
export class CachedMissionSource implements MissionSource {
  private cached: { missions: readonly Mission[]; expiresAt: number } | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly source: MissionSource,
    { ttlMs = 60_000, now = Date.now }: CachedSourceOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async list(): Promise<Result<readonly Mission[], { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.missions);

    const listed = await this.source.list();
    if (!listed.ok) return listed;
    this.cached = { missions: listed.value, expiresAt: this.now() + this.ttlMs };
    return listed;
  }

  /** Drops the cached missions, so the next read sees an admin's change at once (on this server instance). */
  invalidate(): void {
    this.cached = null;
  }
}
