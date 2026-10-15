import type { AttemptLimiter } from "../domain/ports";

export interface AttemptLimiterOptions {
  maxAttempts?: number;
  windowMs?: number;
  now?: () => number;
}

/**
 * Sliding-window limiter kept in the memory of one server instance. It is best effort (each instance
 * counts on its own), which is enough to stop a script from guessing codes; it does not need a
 * database write per scan. Swap the adapter for a shared store if abuse shows up.
 */
export class InMemoryAttemptLimiter implements AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ maxAttempts = 20, windowMs = 60_000, now = Date.now }: AttemptLimiterOptions = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
  }

  async consume(uid: string): Promise<boolean> {
    const current = this.now();
    const recent = (this.attempts.get(uid) ?? []).filter((at) => current - at < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      this.attempts.set(uid, recent);
      return false;
    }
    recent.push(current);
    this.attempts.set(uid, recent);
    return true;
  }
}
