import "server-only";
import { ok, type Result } from "@/shared/lib/result";
import type { AccountDirectory, CadetIdentity } from "../../domain/manage";

export interface CachedAccountDirectoryOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * Keeps each cadet's name and email (what the searches read for every cadet) in this server instance's memory for a
 * minute, so searching as the person types does not ask the identity provider about every account on every pause.
 * Only the accounts missing or expired are asked for; a failed read is never kept. A single account's details and
 * disabling an account go straight through (the latter also forgets that account, so nothing stale outlives it).
 * Names and emails only decorate a list: a minute-old one is fine, a decision never reads them from here.
 */
export class CachedAccountDirectory implements AccountDirectory {
  private readonly kept = new Map<string, { identity: CadetIdentity; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: AccountDirectory,
    { ttlMs = 60_000, now = Date.now }: CachedAccountDirectoryOptions = {},
  ) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  lookup: AccountDirectory["lookup"] = (uid) => this.inner.lookup(uid);

  async lookupMany(uids: readonly string[]): Promise<Result<ReadonlyMap<string, CadetIdentity>, { code: string }>> {
    const at = this.now();
    const found = new Map<string, CadetIdentity>();
    const missing: string[] = [];
    for (const uid of uids) {
      const hit = this.kept.get(uid);
      if (hit && hit.expiresAt > at) found.set(uid, hit.identity);
      else missing.push(uid);
    }
    if (missing.length === 0) return ok(found);

    const fetched = await this.inner.lookupMany(missing);
    if (!fetched.ok) return fetched;
    const expiresAt = this.now() + this.ttlMs;
    for (const [uid, identity] of fetched.value) {
      this.kept.set(uid, { identity, expiresAt });
      found.set(uid, identity);
    }
    return ok(found);
  }

  setDisabled: AccountDirectory["setDisabled"] = async (uid, disabled) => {
    this.kept.delete(uid);
    return this.inner.setDisabled(uid, disabled);
  };
}
