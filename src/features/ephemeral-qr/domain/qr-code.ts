import { isCheckpointId, type CheckpointId } from "@/features/checkins";

/** How long a talk's code on screen can be scanned. Short on purpose: it forces being in the room. */
export const QR_LIFETIME_SECONDS = 120;

/**
 * The entrance's and a stand's code live half as long: they are on a screen in an open area (the door, the stand's
 * tablet) where a photo could travel to someone who is not there.
 */
export const ENTRANCE_QR_LIFETIME_SECONDS = 60;

/** How long a fresh code of a kind lives. */
export const lifetimeSecondsFor = (kind: string): number => (kind === "entrance" || kind === "stand" ? ENTRANCE_QR_LIFETIME_SECONDS : QR_LIFETIME_SECONDS);

/** A code may not claim to expire further ahead than a fresh one would, plus a little clock slack. Longest lifetime, so a shorter one is always fine. */
export const QR_MAX_FUTURE_SECONDS = QR_LIFETIME_SECONDS + 30;

const PREFIX = "devfest:eq:";

export interface ParsedPayload {
  checkpointId: CheckpointId;
  /** Unix seconds. */
  expiresAt: number;
  signature: string;
}

/** What is signed: the checkpoint and when the code stops working. Nothing else can be altered without breaking it. */
export const signingInput = (checkpointId: CheckpointId, expiresAt: number): string => `${checkpointId}.${expiresAt}`;

export const formatPayload = (checkpointId: CheckpointId, expiresAt: number, signature: string): string =>
  `${PREFIX}${checkpointId}.${expiresAt}.${signature}`;

const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXPIRY_PATTERN = /^[0-9]{1,12}$/;

/** `null` for anything that is not shaped like one of our codes. Shape only: the signature is checked elsewhere. */
export function parsePayload(payload: string): ParsedPayload | null {
  if (!payload.startsWith(PREFIX)) return null;

  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [checkpointId, expiry, signature] = parts;

  if (!isCheckpointId(checkpointId) || !EXPIRY_PATTERN.test(expiry) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { checkpointId, expiresAt: Number(expiry), signature };
}
