"use client";

import { useCallback, useEffect, useRef } from "react";
import { ScanReticle, useScanSession, type QrCamera } from "@/features/scanner";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, Card, Icon, UnlockedBadges } from "@/shared/ui";
import { track } from "@/shared/lib/analytics";
import type { ConnectContactAction, ConnectContactActionResult } from "./actions";
import { CadetCardView } from "./CadetCardView";

export interface ContactScannerProps {
  /** The camera that reads the other cadet's code (the app shell binds the real one). */
  camera: QrCamera;
  connect: ConnectContactAction;
  /** After a contact was made: the screen refreshes its list. */
  onConnected: () => void;
  onShowContacts: () => void;
  /** The Logros tab, linked from a badge the contact unlocked (absent when achievements are off). */
  achievementsHref?: string;
}

const FAILURE: ConnectContactActionResult = { ok: false, code: "unknown" };

/**
 * Scans another cadet's contact code: the camera with the reticle, then the other cadet's card and what the
 * contact earned. The camera runs only while this is on screen. Everything about the code is decided by the server.
 */
export function ContactScanner({ camera: Camera, connect, onConnected, onShowContacts, achievementsHref }: ContactScannerProps) {
  const t = copy.network.scan;
  const connectAndTrack = useCallback(
    async (payload: string) => {
      const result = await connect(payload);
      if (result.ok && result.created) track({ name: "contact_made" });
      return result;
    },
    [connect],
  );
  const { state, camera, cameraKey, start, scanAgain } = useScanSession(connectAndTrack, FAILURE);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const result = state.status === "done" ? state.result : null;

  // A result or a problem replaces what the cadet was looking at: move focus there so it is read out.
  useEffect(() => {
    if (state.status === "done" || state.status === "camera-error") resultRef.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (result?.ok && result.created) onConnected();
  }, [result, onConnected]);

  const message = result
    ? result.ok
      ? result.created
        ? t.created
        : t.already
      : copy.network.errors[result.code]
    : state.status === "camera-error"
      ? copy.scanner.cameraErrors[state.code]
      : null;
  const statusText = state.status === "sending" ? t.sending : state.status === "scanning" ? t.hint : null;

  return (
    <div className="gap-space-4 flex flex-col">
      <div className="border-border bg-bg-deep relative aspect-square w-full overflow-hidden rounded-lg border">
        {camera ? <Camera key={cameraKey} {...camera} label={t.videoLabel} /> : null}
        {state.status === "camera-error" ? (
          <div className="absolute inset-0 grid place-items-center">
            <Icon name="camera-off" size={48} className="text-text-subtle" />
          </div>
        ) : (
          <ScanReticle active={state.status === "scanning"} tone={result ? (result.ok ? "success" : "error") : "idle"} />
        )}
        {state.status === "sending" ? (
          <div className="bg-bg-deep/70 absolute inset-0 grid place-items-center">
            <Icon name="loading" size={40} className="text-cyan" />
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="gap-space-4 flex flex-col">
        {statusText ? <p className="type-body text-muted-foreground text-center">{statusText}</p> : null}

        {message ? (
          <Card className="gap-space-4 flex flex-col">
            <div className="gap-space-3 flex items-start">
              <Icon name={result?.ok ? "check" : "alert"} size={28} className={result?.ok ? "text-lime" : "text-danger"} />
              <div className="gap-space-1 flex min-w-0 flex-col">
                <h2 ref={resultRef} tabIndex={-1} className="type-title text-foreground focus-visible:outline-none">
                  {message.title}
                </h2>
                <p className="type-body text-muted-foreground">{message.body}</p>
              </div>
            </div>

            {result?.ok ? (
              <>
                <CadetCardView card={result.card} className="bg-surface-raised border-border p-space-4 rounded-md border" />
                {result.xpEarned + result.creditsEarned > 0 ? (
                  <p className="type-pixel-tag text-accent gap-space-3 flex flex-wrap">
                    {result.xpEarned > 0 ? <span>{interpolate(copy.network.xp, { n: formatNumber(result.xpEarned) })}</span> : null}
                    {result.creditsEarned > 0 ? <span className="text-gold">{interpolate(copy.network.credits, { n: formatNumber(result.creditsEarned) })}</span> : null}
                  </p>
                ) : null}
                {result.capReached ? <p className="type-body-sm text-muted-foreground">{t.capReached}</p> : null}
                <UnlockedBadges badges={result.achievements} href={achievementsHref} />
              </>
            ) : null}

            <div className="gap-space-3 flex flex-col">
              {state.status === "camera-error" ? (
                <Button onClick={() => void start()}>{t.retry}</Button>
              ) : (
                <Button variant={result?.ok ? "secondary" : "primary"} onClick={scanAgain}>
                  {result?.ok ? t.again : t.retry}
                </Button>
              )}
              {result?.ok ? (
                <Button variant="ghost" onClick={onShowContacts}>
                  {t.toContacts}
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
