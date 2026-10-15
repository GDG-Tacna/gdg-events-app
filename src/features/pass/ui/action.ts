import type { PassErrorCode } from "../domain/pass-error";

/** The picture and timing of the attendee's own pass. Plain data: it crosses the client boundary. */
export interface PassView {
  cells: readonly string[];
  /** Server clock, in ms. The countdown runs against these, not against the device clock. */
  issuedAt: number;
  expiresAt: number;
}

export type IssuePassActionResult = { ok: true; pass: PassView } | { ok: false; code: PassErrorCode };

export type IssuePassAction = () => Promise<IssuePassActionResult>;
