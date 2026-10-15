import type { Result } from "@/shared/lib/result";

/**
 * What a reward is for. Each source pays an attendee once per edition: `mission:{id}` for a mission,
 * `minigame:{id}` for the bonus of the mini-game on that mission (phase 5), `talk:{checkpointId}` for
 * attending a talk, `contact:{otherUid}` for a new contact in the cadet network (phase 5).
 */
export type XpSource = `mission:${string}` | `minigame:${string}` | `talk:${string}` | `contact:${string}`;

export const missionSource = (missionId: string): XpSource => `mission:${missionId}`;
export const minigameSource = (missionId: string): XpSource => `minigame:${missionId}`;
export const talkSource = (checkpointId: string): XpSource => `talk:${checkpointId}`;
export const contactSource = (otherUid: string): XpSource => `contact:${otherUid}`;

/** Edition ledger document id: one per attendee and source, the idempotency key of the reward. */
export const ledgerEntryId = (uid: string, source: XpSource) => `${uid}_${source}`;
/** Global wallet ledger document id for credits earned: one per edition, attendee and source. */
export const walletEarnId = (eventId: string, uid: string, source: XpSource) => `${eventId}_${uid}_${source}`;

/** A reward: XP for this edition and G-Credits for the person's global wallet. At least one of them. */
export interface XpGrant {
  uid: string;
  source: XpSource;
  xp: number;
  credits: number;
}

export type XpErrorCode = "not-registered" | "invalid-amount" | "insufficient" | "unknown";

export interface XpError {
  code: XpErrorCode;
}

export const xpError = (code: XpErrorCode): XpError => ({ code });

export interface XpGrantOutcome {
  /** False when this source had already paid this attendee: nothing changed. */
  granted: boolean;
  /** The attendee's XP in this edition after the call. */
  total: number;
  /** The person's G-Credits balance (all editions) after the call. */
  balance: number;
}

/**
 * The only way XP and G-Credits are earned. A reward writes its edition ledger entry, adds to the
 * attendee's XP and credits of this edition and, for credits, to the person's global wallet with its own
 * ledger entry, all in one transaction. A source pays once: repeating a reward changes nothing.
 */
export interface XpLedger {
  grant(grant: XpGrant): Promise<Result<XpGrantOutcome, XpError>>;
}

/**
 * Spending from the global wallet (the future store). Each operation is keyed so a retry never charges
 * twice, and the balance never goes below zero.
 */
export interface WalletSpender {
  spend(input: { uid: string; operationId: string; amount: number; reason: string }): Promise<Result<{ charged: boolean; balance: number }, XpError>>;
}

const isWhole = (value: number, max: number) => Number.isInteger(value) && value >= 0 && value <= max;

/** Whole XP and credits, each 0..10000, and something to give. */
export const isValidReward = (xp: number, credits: number) => isWhole(xp, 10_000) && isWhole(credits, 10_000) && xp + credits > 0;
