"use client";

import { useEffect, useRef } from "react";
import type { RecordCheckInAction } from "@/features/checkins";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, Icon, PixelCoin, UnlockedBadges } from "@/shared/ui";
import type { ScanOutcome } from "../domain/scan-state";
import type { QrCamera } from "./qr-camera";
import { ScanReticle } from "./ScanReticle";
import { useScanner } from "./use-scanner";

export interface ScannerViewProps {
  /** The camera that reads codes (the app shell binds the real one). */
  camera: QrCamera;
  record: RecordCheckInAction;
  /** Where "Ir al inicio" goes. */
  homeHref: string;
  /** The Logros tab, linked from a badge the scan unlocked (absent when achievements are off). */
  achievementsHref?: string;
  /** The Red, offered when another cadet's contact code was scanned here (absent when the network is off). */
  networkHref?: string;
  /** The cadet's own pass, offered when a printed station code was scanned (staff scan the pass there). */
  passHref?: string;
}

interface Message {
  title: string;
  body: string;
}

/** The words for an outcome. A repeat is not an error: the attendee already had this checkpoint. */
export function messageFor(outcome: ScanOutcome): Message {
  if (!outcome.ok) return copy.scanner.errors[outcome.code];
  if (!outcome.recorded) return copy.scanner.already;
  if (outcome.kind === "entrance") return outcome.firstEntrance ? copy.scanner.success.firstEntrance : copy.scanner.success.entrance;
  return copy.scanner.success[outcome.kind];
}

/**
 * The jump scanner: the camera with a reticle over it, what is happening in words, and the result
 * of the last code with what to do next. Everything about the code is decided by the server; this
 * screen only shows the camera and the answer.
 */
export function ScannerView({ camera: Camera, record, homeHref, achievementsHref, networkHref, passHref }: ScannerViewProps) {
  const { state, camera, cameraKey, start, scanAgain } = useScanner(record);
  const resultRef = useRef<HTMLHeadingElement>(null);

  // A result or a problem replaces what the person was looking at: move focus there so it is read out.
  useEffect(() => {
    if (state.status === "done" || state.status === "camera-error") resultRef.current?.focus();
  }, [state.status]);

  const done = state.status === "done" ? state.outcome : null;
  const message = done ? messageFor(done) : state.status === "camera-error" ? copy.scanner.cameraErrors[state.code] : null;
  const succeeded = done?.ok === true;
  // Another cadet's contact code: the way forward is the Red, so scanning again steps back.
  const toNetwork = done && !done.ok && done.code === "contact-code" ? networkHref : undefined;
  // A printed station code: the way forward is showing the cadet's own QR to the staff.
  const toPass = done && !done.ok && done.code === "staff-station" ? passHref : undefined;
  const leadsAway = Boolean(toNetwork || toPass);

  const statusText = state.status === "sending" ? copy.scanner.sending : state.status === "scanning" ? copy.scanner.hint : null;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.scanner.title}</h1>
      </header>

      <div className="border-border bg-bg-deep relative aspect-[3/4] w-full overflow-hidden rounded-lg border min-[760px]:aspect-[4/3]">
        {camera ? <Camera key={cameraKey} {...camera} label={copy.scanner.videoLabel} /> : null}
        {state.status === "camera-error" ? (
          <div className="absolute inset-0 grid place-items-center">
            <Icon name="camera-off" size={48} className="text-text-subtle" />
          </div>
        ) : (
          <ScanReticle
            active={state.status === "scanning"}
            tone={done ? (succeeded ? "success" : "error") : "idle"}
          />
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
              <Icon
                name={state.status === "camera-error" || !succeeded ? "alert" : "check"}
                size={28}
                className={succeeded ? "text-lime" : "text-danger"}
              />
              <div className="gap-space-1 flex min-w-0 flex-col">
                <h2 ref={resultRef} tabIndex={-1} className="type-title text-foreground focus-visible:outline-none">
                  {message.title}
                </h2>
                <p className="type-body text-muted-foreground">{message.body}</p>
              </div>
            </div>

            {done?.ok ? <UnlockedBadges badges={done.achievements} href={achievementsHref} /> : null}

            {done?.ok && done.talkCredits > 0 ? (
              <p className="type-label text-gold gap-space-2 flex items-center">
                <PixelCoin scale={2} />
                {interpolate(copy.scanner.talkCredits, { n: formatNumber(done.talkCredits) })}
              </p>
            ) : null}

            {done?.ok && done.missions.length > 0 ? (
              <ul aria-label={copy.scanner.missions.label} className="gap-space-2 flex flex-col">
                {done.missions.map((mission, index) => (
                  <li key={`${index}-${mission.title}`}className="bg-surface-raised border-border gap-space-3 px-space-3 py-space-2 flex items-center justify-between rounded-md border">
                    <span className="flex min-w-0 flex-col">
                      <span className="type-caption text-muted-foreground">
                        {mission.justCompleted ? copy.scanner.missions.completed : copy.scanner.missions.already}
                      </span>
                      <span className="type-label text-foreground">{mission.title}</span>
                    </span>
                    {mission.justCompleted && mission.xpEarned + mission.creditsEarned > 0 ? (
                      <span className="type-pixel-tag text-accent gap-space-1 flex shrink-0 flex-col items-end">
                        {mission.xpEarned > 0 ? <span>{interpolate(copy.scanner.missions.xp, { xp: formatNumber(mission.xpEarned) })}</span> : null}
                        {mission.creditsEarned > 0 ? <span className="text-gold">{interpolate(copy.scanner.missions.credits, { n: formatNumber(mission.creditsEarned) })}</span> : null}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="gap-space-3 flex flex-col">
              {toNetwork ? <ButtonLink href={toNetwork}>{copy.scanner.toNetwork}</ButtonLink> : null}
              {toPass ? <ButtonLink href={toPass}>{copy.scanner.toPass}</ButtonLink> : null}
              {state.status === "camera-error" ? (
                <Button onClick={() => void start()}>{copy.scanner.retry}</Button>
              ) : (
                <Button variant={succeeded || leadsAway ? "secondary" : "primary"} onClick={scanAgain}>
                  {succeeded ? copy.scanner.scanAgain : copy.scanner.retry}
                </Button>
              )}
              <ButtonLink href={homeHref} variant="ghost">
                {copy.scanner.toHome}
              </ButtonLink>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
