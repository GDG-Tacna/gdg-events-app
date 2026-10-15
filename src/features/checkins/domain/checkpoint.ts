/**
 * What a checkpoint is for. The entrance one is the event registration; a stand one is a sponsor or
 * technology stand of the venue plan, proven with its printed QR (it completes stand missions).
 */
export const CHECKPOINT_KINDS = ["entrance", "talk", "catering", "stand"] as const;
export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number];

/** Stable slug, like squad ids: it ends up in QR payloads and in document ids. */
export type CheckpointId = string;

const CHECKPOINT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

export const isCheckpointId = (value: unknown): value is CheckpointId =>
  typeof value === "string" && CHECKPOINT_ID_PATTERN.test(value);

export const isCheckpointKind = (value: unknown): value is CheckpointKind =>
  typeof value === "string" && (CHECKPOINT_KINDS as readonly string[]).includes(value);

export interface Checkpoint {
  id: CheckpointId;
  kind: CheckpointKind;
  /** What people see (for example the talk title). Falls back to the id when the document has none. */
  name: string;
  /** An inactive checkpoint is kept (old check-ins refer to it) but no longer accepts scans. */
  active: boolean;
}
