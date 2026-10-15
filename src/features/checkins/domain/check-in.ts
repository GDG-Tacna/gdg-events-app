import type { CheckpointId } from "./checkpoint";

/**
 * Deterministic document id: one record per attendee and checkpoint. This is the idempotency key, so a
 * double scan or a retried request can only ever find the record that already exists.
 */
export const checkInId = (uid: string, checkpointId: CheckpointId): string => `${uid}_${checkpointId}`;
