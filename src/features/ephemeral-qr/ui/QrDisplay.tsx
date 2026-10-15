"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, Card, InlineAlert, ProgressBar, Skeleton } from "@/shared/ui";
import { QR_LIFETIME_SECONDS } from "../domain/qr-code";
import type { IssueQrAction } from "./action";
import { QrCodeSvg } from "./QrCodeSvg";
import { useEphemeralQr } from "./use-ephemeral-qr";

export interface QrDisplayProps {
  checkpointId: string;
  /** Shown above the code. Known to the page, so it is there before the first code arrives. */
  name: string;
  issue: IssueQrAction;
}

/** `1:42` for 102 seconds. Rounds up, so the last second still says 0:01 rather than 0:00. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The projector screen: the talk's name, a big code, and how long it has left. The code renews itself
 * before it ends. Everything about the code comes from the server; this only draws it.
 */
export function QrDisplay({ checkpointId, name, issue }: QrDisplayProps) {
  const { state, retry } = useEphemeralQr(issue, checkpointId);

  async function goFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers refuse (iframes, iOS): the code is still readable as it is.
    }
  }

  return (
    <div className="gap-space-5 mx-auto flex w-full max-w-[640px] flex-col items-center text-center">
      <h1 className="type-title-xl text-foreground">{name}</h1>

      <Card className="gap-space-5 flex w-full flex-col items-center">
        {state.status === "showing" ? (
          <>
            <QrCodeSvg
              cells={state.qr.cells}
              label={interpolate(copy.admin.qr.codeLabel, { name })}
              className="aspect-square w-full max-w-[min(100%,70dvh)] rounded-md"
            />
            <div className="gap-space-2 flex w-full flex-col">
              <p role="timer" aria-live="off" className="type-title text-foreground tabular-nums">
                {interpolate(copy.admin.qr.expiresIn, { time: formatCountdown(state.remainingMs) })}
              </p>
              <ProgressBar
                value={Math.ceil(state.remainingMs / 1000)}
                max={QR_LIFETIME_SECONDS}
                label={copy.admin.qr.timeLabel}
                valueText={interpolate(copy.admin.qr.expiresIn, { time: formatCountdown(state.remainingMs) })}
              />
            </div>
            {state.reconnecting ? <InlineAlert>{copy.admin.qr.reconnecting}</InlineAlert> : null}
          </>
        ) : null}

        {state.status === "loading" ? (
          <div aria-busy="true" role="status" className="gap-space-4 flex w-full flex-col items-center">
            <Skeleton className="aspect-square w-full max-w-[420px]" />
            <p className="type-body text-muted-foreground">{copy.admin.qr.loading}</p>
          </div>
        ) : null}

        {state.status === "expired" ? (
          <p role="status" className="type-body text-muted-foreground py-space-8">
            {copy.admin.qr.expired}
          </p>
        ) : null}

        {state.status === "error" ? (
          <div className="gap-space-4 flex w-full flex-col">
            <InlineAlert>{copy.admin.qr.errors[state.code]}</InlineAlert>
            <Button variant="secondary" onClick={retry}>
              {copy.admin.qr.retry}
            </Button>
          </div>
        ) : null}
      </Card>

      <p className="type-body text-muted-foreground">{copy.admin.qr.scanHint}</p>

      <Button variant="ghost" size="sm" onClick={goFullscreen}>
        {copy.admin.qr.fullscreen}
      </Button>
    </div>
  );
}
