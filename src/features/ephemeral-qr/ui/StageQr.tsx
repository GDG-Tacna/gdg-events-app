"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";
import type { IssueQrAction } from "./action";
import { formatCountdown } from "./QrDisplay";
import { QrCodeSvg } from "./QrCodeSvg";
import { useEphemeralQr } from "./use-ephemeral-qr";

export interface StageQrProps {
  checkpointId: string;
  /** The talk's name, big beside the code. Known before the first code arrives. */
  name: string;
  /** Who gives the talk, under its name (nothing when the agenda does not say). */
  speaker?: string;
  issue: IssueQrAction;
}

/** The three steps, each with the color of its number. */
const STEP_TONE = ["bg-violet text-white", "bg-destructive text-on-accent", "bg-gold text-on-accent"] as const;

/**
 * A talk's attendance code drawn for the projector, inside the stage screen (which brings its own header and
 * background): the talk's name and the three steps on the left, and on the right the code as big as the screen
 * allows in a card with a small countdown. The code renews itself before it ends; everything about it comes from the
 * server.
 */
export function StageQr({ checkpointId, name, speaker, issue }: StageQrProps) {
  const { state } = useEphemeralQr(issue, checkpointId);
  const t = copy.stage.talkQr;

  return (
    <section aria-label={interpolate(copy.admin.qr.codeLabel, { name })} className="grid flex-1 grid-cols-1 items-center gap-[4vw] min-[900px]:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-[2.4vh]">
        <p className="text-violet-ink text-[clamp(1rem,2.8vh,2rem)] font-bold tracking-widest uppercase">{t.eyebrow}</p>
        <h2 className="font-display text-[clamp(2rem,8vh,5rem)] leading-[1.06] font-extrabold">{name}</h2>
        {speaker ? <p className="text-muted-foreground text-[clamp(1.1rem,3.4vh,2.25rem)] font-medium">{speaker}</p> : null}
        <ol aria-label={t.stepsLabel} className="mt-[1vh] flex flex-col gap-[1.6vh] text-[clamp(1.1rem,3.2vh,2.25rem)] font-bold">
          {t.steps.map((step, index) => (
            <li key={step} className="flex items-center gap-[1.4vw]">
              <span aria-hidden="true" className={cn("flex size-[5.2vh] shrink-0 items-center justify-center rounded-full text-[clamp(1rem,2.6vh,1.75rem)]", STEP_TONE[index])}>
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-foreground text-[clamp(1rem,2.6vh,1.75rem)] font-medium">{copy.admin.qr.scanHint}</p>
      </div>

      <div className="flex flex-col items-center gap-[2vh]">
        <div className="border-ink flex items-center justify-center rounded-lg border-2 bg-white p-[2.4vh] shadow-[0.8vh_0.8vh_0_var(--ink)]">
          {state.status === "showing" ? <QrCodeSvg cells={state.qr.cells} label={interpolate(copy.admin.qr.codeLabel, { name })} className="aspect-square h-[min(52vh,80vw)] rounded-md" /> : null}
          {state.status === "loading" ? (
            <div aria-busy="true" role="status" className="flex flex-col items-center gap-4">
              <Skeleton className="aspect-square h-[min(52vh,80vw)]" />
              <p className="text-ink text-[clamp(1rem,2.4vh,2rem)]">{copy.admin.qr.loading}</p>
            </div>
          ) : null}
          {state.status === "expired" ? (
            <p role="status" className="text-ink flex aspect-square h-[min(52vh,80vw)] items-center justify-center text-center text-[clamp(1rem,2.4vh,2rem)]">
              {copy.admin.qr.expired}
            </p>
          ) : null}
          {state.status === "error" ? (
            <p role="alert" className="flex aspect-square h-[min(52vh,80vw)] items-center justify-center text-center text-[clamp(1rem,2.4vh,2rem)] text-[#b3261e]">
              {copy.admin.qr.errors[state.code]}
            </p>
          ) : null}
        </div>
        {state.status === "showing" ? (
          <p role="timer" aria-live="off" className="border-ink bg-surface flex items-center gap-3 rounded-full border-2 px-[1.6vw] py-[0.8vh] text-[clamp(1rem,2.6vh,1.75rem)] font-bold tabular-nums">
            <span aria-hidden="true" className="bg-lime size-[1.4vh] min-h-2 min-w-2 rounded-full" />
            {interpolate(copy.admin.qr.expiresIn, { time: formatCountdown(state.remainingMs) })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
