import type { Result } from "@/shared/lib/result";
import type { Evaluation, MissionCompletion } from "./completion";
import type { Mission } from "./mission";

/** The missions the edition has saved (active and inactive). Empty until the admin saves or seeds them. */
export interface MissionSource {
  list(): Promise<Result<readonly Mission[], { code: string }>>;
}

export interface CompletionStore {
  /** Everything one attendee did with missions. */
  listFor(uid: string): Promise<Result<readonly MissionCompletion[], { code: string }>>;
  /**
   * Reads the attendee's completion of a mission and stores what `decide` returns, in one transaction,
   * so two answers sent at once cannot both use the same attempt. Returns the completion before and after
   * (`after` equals `before` when `decide` changed nothing).
   */
  apply(
    uid: string,
    missionId: string,
    decide: (previous: MissionCompletion | null) => Evaluation,
  ): Promise<Result<{ before: MissionCompletion | null; evaluation: Evaluation; after: MissionCompletion | null }, { code: string }>>;
}

/** Grants XP once per source (the economy ledger, through a structural port). */
export interface XpGranter {
  grant(grant: { uid: string; source: `mission:${string}`; xp: number; credits: number }): Promise<Result<{ granted: boolean; total: number }, { code: string }>>;
}

/** Limits how fast one attendee can answer, which stops guessing keywords. */
export interface AttemptLimiter {
  consume(uid: string): Promise<boolean>;
}

/** G-Credits a mission gives under the edition's economy: its own value, the type's default, or none when off. */
export interface CreditRules {
  creditsFor(type: string, own: number | null): Promise<number>;
}
