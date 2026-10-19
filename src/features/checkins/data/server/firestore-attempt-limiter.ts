import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { logServerError } from "@/shared/lib/log";
import type { AttemptLimiter } from "../../domain/ports";

/** Attempt windows of the limits that every server instance must share (`{scope}_{uid}`): server only. */
export const RATE_LIMITS_COLLECTION = "rateLimits";

export interface FirestoreAttemptLimiterOptions {
  /** What is being limited; it keeps each limit's windows apart (letters, digits and dashes). */
  scope: string;
  maxAttempts: number;
  windowMs: number;
  now?: () => number;
  getDb?: () => Firestore;
}

/**
 * A fixed-window limiter shared by every server instance: one document per person and scope, counted in a
 * transaction. The in-memory limiter is per instance, so with several instances (Vercel, App Hosting) its limit
 * multiplies and starts over on each new one; use this where the limit is what stops guessing (typed keywords).
 * It costs a transaction per attempt, so keep it off the paths that scale with every scan. If Firestore fails it lets
 * the attempt through: the answer it guards needs Firestore too, and a limiter outage must not block the event.
 */
export class FirestoreAttemptLimiter implements AttemptLimiter {
  private readonly scope: string;
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly getDb: () => Firestore;

  constructor({ scope, maxAttempts, windowMs, now = Date.now, getDb = getAdminFirestore }: FirestoreAttemptLimiterOptions) {
    this.scope = scope;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
    this.getDb = getDb;
  }

  async consume(uid: string): Promise<boolean> {
    try {
      const db = this.getDb();
      const ref = db.collection(RATE_LIMITS_COLLECTION).doc(`${this.scope}_${uid}`);
      return await db.runTransaction(async (tx) => {
        const data = (await tx.get(ref)).data();
        const current = this.now();
        const start = typeof data?.windowStart === "number" ? data.windowStart : 0;
        const count = typeof data?.count === "number" ? data.count : 0;
        if (current - start >= this.windowMs) {
          tx.set(ref, { windowStart: current, count: 1 });
          return true;
        }
        if (count >= this.maxAttempts) return false;
        tx.set(ref, { windowStart: start, count: count + 1 });
        return true;
      });
    } catch (cause) {
      logServerError("checkins.limiter.consume", cause);
      return true;
    }
  }
}
