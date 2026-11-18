"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import type { RecordCheckInAction, ScanContact } from "@/features/checkins";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, Icon, PixelCoin, Thumbnail, UnlockedBadges } from "@/shared/ui";
import type { ScanOutcome } from "../domain/scan-state";
import type { QrCamera } from "./qr-camera";
import { rewardTimeline } from "./reward-chain";
import { ScanReticle } from "./ScanReticle";
import { ResultIcon, XpProgress } from "./ScanResultParts";
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
  /** The missions board, offered when the scan completed a mission (absent when missions are off). */
  missionsHref?: string;
  /** How the other cadet is shown when a contact code was scanned (the network feature draws it; absent: just the alias). */
  renderContact?: (contact: ScanContact) => ReactNode;
}

interface Message {
  title: string;
  body: string;
}

/** The words for an outcome. A repeat is not an error: the attendee already had this checkpoint. */
export function messageFor(outcome: ScanOutcome): Message {
  if (!outcome.ok) return copy.scanner.errors[outcome.code];
  if (outcome.kind === "contact") return outcome.recorded ? copy.scanner.success.contact : copy.scanner.alreadyContact;
  if (!outcome.recorded) return copy.scanner.already;
  if (outcome.kind === "entrance") return outcome.firstEntrance ? copy.scanner.success.firstEntrance : copy.scanner.success.entrance;
  return copy.scanner.success[outcome.kind];
}

/** A short buzz on phones that have one: a scan that went through, a longer one for a new rank, a double for a problem. */
function buzz(outcome: ScanOutcome) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (!outcome.ok) navigator.vibrate([40, 60, 40]);
  else navigator.vibrate(outcome.progress?.rankUp ? [40, 60, 90] : 40);
}

/**
 * The jump scanner: the camera with a reticle over it while it looks for a code. When a code is read the camera goes
 * away and only the answer is shown: a success draws its check, the missions it completed stamp one after another, the
 * XP counts up while the bar fills (and announces a new rank), and the badges it unlocked drop in last. A problem shows
 * its message alone. Everything about the code is decided by the server; this screen only shows the answer.
 */
export function ScannerView({ camera: Camera, record, homeHref, achievementsHref, networkHref, passHref, missionsHref, renderContact }: ScannerViewProps) {
  const { state, camera, cameraKey, start, scanAgain } = useScanner(record);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion() ?? false;

  // A result or a problem replaces what the person was looking at: move focus there so it is read out.
  useEffect(() => {
    if (state.status === "done" || state.status === "camera-error") resultRef.current?.focus();
  }, [state.status]);

  const done = state.status === "done" ? state.outcome : null;
  useEffect(() => {
    if (done && !reduce) buzz(done);
    // One buzz per result, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const message = done ? messageFor(done) : state.status === "camera-error" ? copy.scanner.cameraErrors[state.code] : null;
  const succeeded = done?.ok === true;
  // Another cadet's pass (only staff scan it) or a contact just made: the way forward is the Red, so scanning again steps back.
  const toNetwork = done && ((!done.ok && done.code === "pass-code") || (done.ok && done.kind === "contact")) ? networkHref : undefined;
  // A printed station code: the way forward is showing the cadet's own QR to the staff.
  const toPass = done && !done.ok && done.code === "staff-station" ? passHref : undefined;
  // Missions this scan just completed: the board shows them with a celebration, so the way forward is there.
  const justCompleted = done?.ok ? done.missions.filter((mission) => mission.justCompleted) : [];
  const toMissions = missionsHref && justCompleted.length > 0 ? `${missionsHref}?completadas=${justCompleted.map((mission) => mission.id).join(",")}` : undefined;
  const leadsAway = Boolean(toNetwork || toPass || toMissions);
  // The entrance or the stand just scanned, with its logo and what it is (a talk has its own mission card).
  const place = done?.ok && (done.kind === "entrance" || done.kind === "stand") ? (done.checkpoint ?? null) : null;
  const progress = done?.ok ? (done.progress ?? null) : null;
  const timeline = rewardTimeline({ missions: done?.ok ? done.missions.length : 0, hasProgress: progress !== null, rankUp: progress?.rankUp ?? false });

  const statusText = state.status === "sending" ? copy.scanner.sending : state.status === "scanning" ? copy.scanner.hint : null;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.scanner.title}</h1>
      </header>

      {done ? null : (
        <div className="border-border bg-bg-deep relative aspect-[3/4] w-full overflow-hidden rounded-lg border min-[760px]:aspect-[4/3]">
          {camera ? <Camera key={cameraKey} {...camera} label={copy.scanner.videoLabel} /> : null}
          {state.status === "camera-error" ? (
            <div className="absolute inset-0 grid place-items-center">
              <Icon name="camera-off" size={48} className="text-text-subtle" />
            </div>
          ) : (
            <ScanReticle active={state.status === "scanning"} tone="idle" />
          )}
          {state.status === "sending" ? (
            <div className="bg-bg-deep/70 absolute inset-0 grid place-items-center">
              <Icon name="loading" size={40} className="text-cyan-ink" />
            </div>
          ) : null}
        </div>
      )}

      <div aria-live="polite" className="gap-space-4 flex flex-col">
        {statusText ? <p className="type-body text-muted-foreground text-center">{statusText}</p> : null}

        {message ? (
          <motion.div initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
            <Card className="gap-space-4 flex flex-col">
              <div className="gap-space-3 flex items-start">
                <ResultIcon ok={state.status !== "camera-error" && succeeded} reduce={reduce} />
                <div className="gap-space-1 flex min-w-0 flex-col">
                  <h2 ref={resultRef} tabIndex={-1} className="type-title text-foreground focus-visible:outline-none">
                    {message.title}
                  </h2>
                  <p className="type-body text-muted-foreground">{message.body}</p>
                </div>
              </div>

              {place ? (
                <div aria-label={copy.scanner.placeLabel} role="group" className="bg-surface-raised border-border gap-space-3 p-space-3 flex items-center rounded-md border">
                  {place.image ? <Thumbnail url={place.image} size={64} /> : null}
                  <div className="gap-space-1 flex min-w-0 flex-col">
                    <p className="type-label text-foreground">{place.name}</p>
                    {place.description ? <p className="type-body-sm text-muted-foreground">{place.description}</p> : null}
                  </div>
                </div>
              ) : null}

              {done?.ok && done.contact ? (renderContact ? renderContact(done.contact) : <p className="type-label text-foreground">{done.contact.card.alias}</p>) : null}

              {done?.ok && done.missions.length > 0 ? (
                <ul aria-label={copy.scanner.missions.label} className="gap-space-2 flex flex-col">
                  {done.missions.map((mission, index) => (
                    <motion.li
                      key={`${index}-${mission.title}`}
                      className="bg-surface-raised border-border gap-space-3 px-space-3 py-space-2 flex items-center justify-between rounded-md border"
                      initial={reduce ? false : { opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: timeline.missions + index * 0.3 }}
                    >
                      <span className="flex min-w-0 flex-col">
                        {/* The stamp pops when the mission is new; a repeat just says so. */}
                        <motion.span
                          className="type-caption text-muted-foreground"
                          initial={reduce || !mission.justCompleted ? false : { scale: 0.6 }}
                          animate={{ scale: 1 }}
                          style={{ originX: 0 }}
                          transition={{ type: "spring", stiffness: 420, damping: 14, delay: timeline.missions + index * 0.3 + 0.15 }}
                        >
                          {mission.justCompleted ? copy.scanner.missions.completed : copy.scanner.missions.already}
                        </motion.span>
                        <span className="type-label text-foreground">{mission.title}</span>
                      </span>
                      {mission.justCompleted && mission.xpEarned + mission.creditsEarned > 0 ? (
                        <span className="type-pixel-tag text-lime-ink gap-space-1 flex shrink-0 flex-col items-end">
                          {mission.xpEarned > 0 ? <span>{interpolate(copy.scanner.missions.xp, { xp: formatNumber(mission.xpEarned) })}</span> : null}
                          {mission.creditsEarned > 0 ? <span className="text-gold-ink">{interpolate(copy.scanner.missions.credits, { n: formatNumber(mission.creditsEarned) })}</span> : null}
                        </span>
                      ) : null}
                    </motion.li>
                  ))}
                </ul>
              ) : null}

              {progress ? <XpProgress progress={progress} delay={timeline.xp} barDelay={timeline.bar} rankDelay={timeline.rankUp} reduce={reduce} /> : null}

              {done?.ok && done.talkCredits > 0 ? (
                <p className="type-label text-gold-ink gap-space-2 flex items-center">
                  <PixelCoin scale={2} />
                  {interpolate(copy.scanner.talkCredits, { n: formatNumber(done.talkCredits) })}
                </p>
              ) : null}

              {done?.ok ? <UnlockedBadges badges={done.achievements} href={achievementsHref} animated delay={timeline.badges} /> : null}

              <div className="gap-space-3 flex flex-col">
                {toMissions ? <ButtonLink href={toMissions}>{justCompleted.length === 1 ? copy.scanner.viewMission : copy.scanner.viewMissions}</ButtonLink> : null}
                {toNetwork ? <ButtonLink href={toNetwork}>{done?.ok ? copy.scanner.toContacts : copy.scanner.toNetwork}</ButtonLink> : null}
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
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
