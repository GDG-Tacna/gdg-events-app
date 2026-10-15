import "server-only";
import { err, ok, type Result } from "@/shared/lib/result";
import type { SquadStore } from "../../domain/manage";
import type { SquadCatalog } from "../../domain/ports";
import type { Squad } from "../../domain/squad";
import { squadError, type SquadError } from "../../domain/squad-error";

export interface CachedCatalogOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * The catalog attendees read: the admin-maintained squads of the edition, kept in memory for a short time.
 * Every dashboard and squad screen asks for it, and squads change rarely, so a minute of cache saves a read
 * per squad on every page view (it matters at the venue, with everyone opening the app at once).
 * A failed read is never cached.
 */
export class CachedSquadCatalog implements SquadCatalog {
  private cached: { squads: readonly Squad[]; expiresAt: number } | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: Pick<SquadStore, "list">,
    { ttlMs = 60_000, now = Date.now }: CachedCatalogOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async list(): Promise<Result<readonly Squad[], SquadError>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.squads);

    const listed = await this.store.list();
    if (!listed.ok) return err(squadError("unknown"));

    const squads = listed.value.map(({ id, name, tagline, sprite, active }) => ({ id, name, tagline, sprite, active }));
    this.cached = { squads, expiresAt: this.now() + this.ttlMs };
    return ok(squads);
  }

  /** Drops the cached list, so the next read sees an admin's change at once (on this server instance). */
  invalidate(): void {
    this.cached = null;
  }
}
