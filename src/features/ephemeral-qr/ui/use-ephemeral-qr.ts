"use client";

import { useCallback } from "react";
import type { EphemeralQrErrorCode } from "../domain/qr-error";
import type { IssueQrAction, QrView } from "./action";
import { REFRESH_BEFORE_MS, useRenewingCode } from "./use-renewing-code";

export { REFRESH_BEFORE_MS };

export type QrScreenState =
  | { status: "loading" }
  | {
      status: "showing";
      qr: QrView;
      /** Milliseconds left, measured against the server's clock. */
      remainingMs: number;
      /** A refresh failed: the current code stays up until it ends. */
      reconnecting: boolean;
    }
  /** The last code ended and the next one has not arrived yet. */
  | { status: "expired" }
  | { status: "error"; code: EphemeralQrErrorCode };

/**
 * Keeps a fresh talk code on screen (see `useRenewingCode` for how it renews and what it rides out).
 * `now` must keep the same identity between renders.
 */
export function useEphemeralQr(issue: IssueQrAction, checkpointId: string, now: () => number = Date.now) {
  const request = useCallback(async () => {
    const result = await issue({ checkpointId });
    return result.ok ? ({ ok: true, value: result.qr } as const) : result;
  }, [issue, checkpointId]);

  const { state, retry } = useRenewingCode<QrView, EphemeralQrErrorCode>(request, "unknown", now);

  const mapped: QrScreenState =
    state.status === "showing"
      ? { status: "showing", qr: state.code, remainingMs: state.remainingMs, reconnecting: state.reconnecting }
      : state;

  return { state: mapped, retry };
}
