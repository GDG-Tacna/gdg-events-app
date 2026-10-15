import type { Result } from "@/shared/lib/result";

/** A checkpoint as this feature needs it. The check-ins catalog satisfies it (structurally). */
export interface ServeCheckpoint {
  id: string;
  kind: string;
  name: string;
  active: boolean;
}

export interface CheckpointLookup {
  find(id: string): Promise<Result<ServeCheckpoint | null, { code: string }>>;
  listActive(): Promise<Result<readonly ServeCheckpoint[], { code: string }>>;
}

/** Turns a scanned attendee pass into the attendee it belongs to. */
export interface PassCheck {
  verify(payload: string): Promise<Result<{ uid: string }, { code: "invalid-code" | "expired-code" }>>;
}

export interface AttendeeSummary {
  alias: string;
  squadId: string | null;
}

export interface AttendeeLookup {
  /** `null` when the person has no profile in the active edition. */
  find(uid: string): Promise<Result<AttendeeSummary | null, { code: string }>>;
}

/** Stores the check-in. The check-ins repository satisfies it: idempotent per attendee and checkpoint. */
export interface ServeRecorder {
  record(input: {
    uid: string;
    checkpoint: ServeCheckpoint & { kind: "entrance" | "catering" | "stand" };
    at: Date;
  }): Promise<Result<{ kind: "recorded"; firstEntrance: boolean } | { kind: "already-recorded" }, { code: string }>>;
}

export interface RationCounter {
  count(checkpointId: string): Promise<Result<number, { code: string }>>;
}

/** Limits how fast one staff member can scan. */
export interface ServeLimiter {
  consume(uid: string): Promise<boolean>;
}

/** What the person lacks for a meal (see `foodShortfall`). */
export interface GateShortfall {
  level: number | null;
  talks: number | null;
}

export type GateVerdict = { allowed: true } | { allowed: false; missing: GateShortfall };

/**
 * Decides whether an attendee may receive this meal: the food gate of the catering checkpoint (minimum
 * level, talks attended). A failed read is an error, so the staff scans again instead of a wrong answer.
 */
export interface ServeGate {
  check(input: { uid: string; checkpoint: ServeCheckpoint }): Promise<Result<GateVerdict, { code: string }>>;
}
