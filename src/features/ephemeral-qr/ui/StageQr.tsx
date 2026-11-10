"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Skeleton } from "@/shared/ui";
import type { IssueQrAction } from "./action";
import { formatCountdown } from "./QrDisplay";
import { QrCodeSvg } from "./QrCodeSvg";
import { useEphemeralQr } from "./use-ephemeral-qr";

export interface StageQrProps {
  checkpointId: string;
  /** The talk's name, big above the code. Known before the first code arrives. */
  name: string;
  issue: IssueQrAction;
}

/**
 * A talk's attendance code drawn for the projector, inside the stage screen (which brings its own header and
 * background): the talk's name, a code as big as the screen allows, and a small countdown. The code renews itself
 * before it ends; everything about it comes from the server.
 */
export function StageQr({ checkpointId, name, issue }: StageQrProps) {
  const { state } = useEphemeralQr(issue, checkpointId);

  return (
    <section aria-label={interpolate(copy.admin.qr.codeLabel, { name })} className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] text-center">
      <h2 className="font-display max-w-[90vw] text-[clamp(1.75rem,6vh,5rem)] leading-tight font-bold">{name}</h2>

      {state.status === "showing" ? (
        <>
          <QrCodeSvg cells={state.qr.cells} label={interpolate(copy.admin.qr.codeLabel, { name })} className="aspect-square h-[min(58vh,80vw)] rounded-md" />
          <p role="timer" aria-live="off" className="text-muted-foreground text-[clamp(1rem,2.4vh,2rem)] tabular-nums">
            {interpolate(copy.admin.qr.expiresIn, { time: formatCountdown(state.remainingMs) })}
          </p>
        </>
      ) : null}

      {state.status === "loading" ? (
        <div aria-busy="true" role="status" className="flex flex-col items-center gap-4">
          <Skeleton className="aspect-square h-[min(58vh,80vw)]" />
          <p className="text-muted-foreground text-[clamp(1rem,2.4vh,2rem)]">{copy.admin.qr.loading}</p>
        </div>
      ) : null}

      {state.status === "expired" ? (
        <p role="status" className="text-muted-foreground text-[clamp(1rem,2.4vh,2rem)]">
          {copy.admin.qr.expired}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-[clamp(1rem,2.4vh,2rem)]">
          {copy.admin.qr.errors[state.code]}
        </p>
      ) : null}

      <p className="text-foreground text-[clamp(1.1rem,3vh,2.5rem)] font-semibold">{copy.admin.qr.scanHint}</p>
    </section>
  );
}
