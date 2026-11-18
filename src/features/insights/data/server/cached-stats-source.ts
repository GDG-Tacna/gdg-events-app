import "server-only";
import type { Result } from "@/shared/lib/result";
import type { StatsSource } from "../../domain/stats";

export interface CachedStatsOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * Keeps each number of the admin's home in this server instance's memory for half a minute, so organizers who open or
 * refresh it share the counts instead of paying for them on every visit. Only successful reads are kept. The counts
 * are for looking at (a few seconds late is fine); the admin role is checked before any of them is asked for.
 */
export class CachedStatsSource implements StatsSource {
  private readonly kept = new Map<string, { value: Result<unknown, { code: string }>; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: StatsSource,
    { ttlMs = 30_000, now = Date.now }: CachedStatsOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  private async remember<T>(key: string, load: () => Promise<Result<T, { code: string }>>): Promise<Result<T, { code: string }>> {
    const hit = this.kept.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as Result<T, { code: string }>;
    const value = await load();
    if (value.ok) this.kept.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  editions: StatsSource["editions"] = () => this.remember("editions", () => this.inner.editions());
  registered: StatsSource["registered"] = (eventId) => this.remember(`registered:${eventId}`, () => this.inner.registered(eventId));
  attended: StatsSource["attended"] = (eventId) => this.remember(`attended:${eventId}`, () => this.inner.attended(eventId));
  checkInsOfKind: StatsSource["checkInsOfKind"] = (eventId, kind) => this.remember(`checkins:${eventId}:${kind}`, () => this.inner.checkInsOfKind(eventId, kind));
  missionsCompleted: StatsSource["missionsCompleted"] = (eventId) => this.remember(`missions:${eventId}`, () => this.inner.missionsCompleted(eventId));
  contacts: StatsSource["contacts"] = (eventId) => this.remember(`contacts:${eventId}`, () => this.inner.contacts(eventId));
  squadMembers: StatsSource["squadMembers"] = (eventId, squadId) => this.remember(`squad:${eventId}:${squadId}`, () => this.inner.squadMembers(eventId, squadId));
  rations: StatsSource["rations"] = (eventId) => this.remember(`rations:${eventId}`, () => this.inner.rations(eventId));
}
