import type { EphemeralQrErrorCode } from "../domain/qr-error";

/** The picture and timing of a code. The payload itself stays on the server: the screen only draws the cells. */
export interface QrView {
  checkpointId: string;
  name: string;
  /** Rows of "1" (dark) and "0" (light), without the quiet zone. */
  cells: readonly string[];
  /** Server clock, in ms. The countdown runs against these, not against the device clock. */
  issuedAt: number;
  expiresAt: number;
}

/** What the issue action answers to the screen. Plain data: it crosses the client boundary. */
export type IssueQrActionResult = { ok: true; qr: QrView } | { ok: false; code: EphemeralQrErrorCode };

export type IssueQrAction = (input: { checkpointId: string }) => Promise<IssueQrActionResult>;
