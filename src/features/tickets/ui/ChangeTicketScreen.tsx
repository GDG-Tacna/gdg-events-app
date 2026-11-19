"use client";

import { useCallback, useState } from "react";
import { ScanReticle, useScanSession, type QrCamera } from "@/features/scanner";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Icon, InlineAlert } from "@/shared/ui";
import { TICKET_TYPES, type TicketType } from "../domain/ticket";
import type { ChangeCadetTicketAction, LookupTicketAction, LookupTicketActionResult } from "./actions";
import { TicketBadge, TicketChip, ticketName } from "./TicketChip";

export interface ChangeTicketScreenProps {
  /** The camera that reads the cadets' QR codes (the app shell binds the real one). */
  camera: QrCamera;
  /** Verifies the scanned pass and answers who the cadet is and their ticket. */
  lookup: LookupTicketAction;
  change: ChangeCadetTicketAction;
  /** Where "Volver a los puestos" goes. */
  backHref: string;
}

const FAILED: LookupTicketActionResult = { ok: false, code: "unknown" };

type Outcome = { kind: "done" | "unchanged"; type: TicketType } | { kind: "error"; code: keyof typeof copy.tickets.errors };

/**
 * The staff screen «Cambiar entrada»: scan a cadet's pass, see their alias and ticket, pick the new ticket with one of
 * three big buttons and confirm. The server verifies the pass and audits every change; this only shows the answers.
 */
export function ChangeTicketScreen({ camera: Camera, lookup, change, backHref }: ChangeTicketScreenProps) {
  const t = copy.staff.tickets;
  const [chosen, setChosen] = useState<TicketType | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [saving, setSaving] = useState(false);
  // The ticket the cadet has now, as far as this screen knows: it follows a successful change.
  const [current, setCurrent] = useState<TicketType | null>(null);

  const submit = useCallback(
    async (payload: string): Promise<LookupTicketActionResult> => {
      const result = await lookup({ payload });
      if (result.ok) {
        setChosen(null);
        setOutcome(null);
        setCurrent(result.ticket);
      }
      return result;
    },
    [lookup],
  );
  const { state, camera, cameraKey, start, scanAgain } = useScanSession(submit, FAILED);

  const result = state.status === "done" ? state.result : null;
  const cadet = result?.ok ? result : null;

  async function confirm() {
    if (!cadet || chosen === null || saving) return;
    setSaving(true);
    let answer: Awaited<ReturnType<ChangeCadetTicketAction>>;
    try {
      answer = await change({ uid: cadet.uid, type: chosen });
    } catch {
      answer = { ok: false, code: "unknown" };
    }
    setSaving(false);
    if (!answer.ok) return setOutcome({ kind: "error", code: answer.code });
    setOutcome({ kind: current === chosen ? "unchanged" : "done", type: chosen });
    setCurrent(chosen);
  }

  const next = () => {
    setChosen(null);
    setOutcome(null);
    scanAgain();
  };

  const showCamera = cadet === null;
  const statusText = state.status === "sending" ? t.sending : t.hint;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <div hidden={!showCamera} className="gap-space-4 flex flex-col">
        <div className="border-border bg-bg-deep relative aspect-[3/4] w-full overflow-hidden rounded-lg border min-[760px]:aspect-[4/3]">
          {camera ? <Camera key={cameraKey} {...camera} label={copy.scanner.videoLabel} /> : null}
          {state.status === "camera-error" ? (
            <div className="absolute inset-0 grid place-items-center">
              <Icon name="camera-off" size={48} className="text-text-subtle" />
            </div>
          ) : (
            <ScanReticle active={state.status === "scanning"} />
          )}
          {state.status === "sending" ? (
            <div className="bg-bg-deep/70 absolute inset-0 grid place-items-center">
              <Icon name="loading" size={40} className="text-cyan" />
            </div>
          ) : null}
        </div>

        {state.status === "camera-error" ? (
          <div role="alert" className="gap-space-3 flex flex-col">
            <h2 className="type-title text-foreground">{copy.scanner.cameraErrors[state.code].title}</h2>
            <p className="type-body text-muted-foreground">{copy.scanner.cameraErrors[state.code].body}</p>
            <Button onClick={() => void start()}>{copy.scanner.retry}</Button>
          </div>
        ) : (
          <p aria-live="polite" className="type-body text-muted-foreground text-center">
            {statusText}
          </p>
        )}

        {result && !result.ok ? (
          <div className="gap-space-3 flex flex-col">
            <InlineAlert>{copy.tickets.errors[result.code]}</InlineAlert>
            <Button variant="secondary" onClick={next}>
              {t.cancel}
            </Button>
          </div>
        ) : null}
      </div>

      {cadet ? (
        <section aria-label={t.title} className="border-border bg-surface p-space-4 gap-space-4 flex flex-col rounded-lg border">
          <div className="gap-space-2 flex flex-col">
            <p className="type-title-xl text-foreground break-all">{cadet.alias}</p>
            {current ? <TicketBadge type={current} /> : null}
          </div>

          {outcome?.kind === "error" ? <InlineAlert>{copy.tickets.errors[outcome.code]}</InlineAlert> : null}
          {outcome && outcome.kind !== "error" ? (
            <p role="status" className="type-body border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
              {interpolate(outcome.kind === "done" ? t.done : t.unchanged, { alias: cadet.alias, name: ticketName(outcome.type) })}
            </p>
          ) : null}

          {outcome === null || outcome.kind === "error" ? (
            <>
              <fieldset className="gap-space-3 flex flex-col" disabled={saving}>
                <legend className="type-label text-foreground mb-space-2">{t.pickLegend}</legend>
                <div className="gap-space-3 flex flex-col">
                  {TICKET_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={chosen === type}
                      onClick={() => setChosen(type)}
                      className={cn(
                        "type-title border-line-strong text-foreground focus-visible:ring-ring flex min-h-14 items-center justify-between rounded-full border-2 px-6 py-3 text-left focus-visible:ring-[3px] focus-visible:outline-none",
                        chosen === type && "border-primary bg-primary/10",
                      )}
                    >
                      <span>{ticketName(type)}</span>
                      {current === type ? <TicketChip type={type} /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button loading={saving} disabled={saving || chosen === null} onClick={() => void confirm()}>
                {chosen === null ? t.pickLegend : interpolate(t.confirm, { name: ticketName(chosen) })}
              </Button>
            </>
          ) : null}

          <Button variant="secondary" disabled={saving} onClick={next}>
            {t.cancel}
          </Button>
        </section>
      ) : null}

      <ButtonLink href={backHref} variant="ghost">
        {t.back}
      </ButtonLink>
    </div>
  );
}
