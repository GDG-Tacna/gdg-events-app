"use client";

import { useCallback, useEffect, useState } from "react";
import { ScanReticle, useScanSession, type QrCamera } from "@/features/scanner";
import { copy } from "@/shared/copy/es";
import { rankWithLevel } from "@/shared/copy/rank-name";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Icon } from "@/shared/ui";
import type { StationKind } from "../domain/serve";
import type { ServeAction, ServeActionResult } from "./action";

export interface ServeScreenProps {
  /** The camera that reads the cadets' QR codes (the app shell binds the real one). */
  camera: QrCamera;
  serve: ServeAction;
  checkpointId: string;
  /** Entrance, catering or stand: it decides the counter's label and how a result reads. */
  kind: StationKind;
  /** The station being operated, shown above the camera. */
  name: string;
  /** Cadets scanned here so far, or `null` when it could not be read. */
  initialCount: number | null;
  /** Where "Cambiar de puesto" goes. */
  backHref: string;
}

const FAILED: ServeActionResult = { ok: false, code: "unknown" };

/** How long a result stays up before the camera looks for the next person. A tap skips the wait. */
const SHOW_MS = { served: 1800, refused: 3200, missing: 5000 } as const;

type Verdict = "served" | "already" | "refused";

/** What the person lacks, said to the staff ("Le falta llegar a Piloto (NV 2)", "Le faltan 2 charlas más"). */
export function servingShortfall(missing: { level: number | null; levelName: string | null; talks: number | null }): string[] {
  const lines: string[] = [];
  if (missing.level !== null) lines.push(interpolate(copy.staff.missing.level, { rank: rankWithLevel(missing.level, missing.levelName) }));
  if (missing.talks !== null) lines.push(missing.talks === 1 ? copy.staff.missing.talksOne : interpolate(copy.staff.missing.talksMany, { n: formatNumber(missing.talks) }));
  return lines;
}

const verdictOf = (result: ServeActionResult): Verdict => (!result.ok ? "refused" : result.status === "served" ? "served" : "already");

const VERDICT_CLASSES: Record<Verdict, string> = {
  served: "bg-accent text-on-accent",
  already: "bg-gold text-on-accent",
  refused: "bg-danger text-on-accent",
};

/**
 * The staff screen at a station (entrance, catering or stand). The camera looks for a cadet's personal QR;
 * each one is checked on the server and the answer fills the whole screen (green: done, amber: already
 * counted here, red: refused with the reason) so it reads at a glance in a long line. A stand visit also
 * lists the missions it completed, to tell the cadet. It clears by itself after a moment or on a tap, and the
 * station's count stays on top. The server decides everything.
 */
export function ServeScreen({ camera: Camera, serve, checkpointId, kind, name, initialCount, backHref }: ServeScreenProps) {
  const [count, setCount] = useState(initialCount);

  const submit = useCallback(
    async (payload: string): Promise<ServeActionResult> => {
      const result = await serve({ checkpointId, payload });
      if (result.ok) {
        // The server's number is the truth; without it, a new ration adds one to what is on screen.
        if (result.servedCount !== null) setCount(result.servedCount);
        else if (result.status === "served") setCount((current) => (current === null ? null : current + 1));
      }
      return result;
    },
    [serve, checkpointId],
  );
  const { state, camera, cameraKey, start, scanAgain } = useScanSession(submit, FAILED);

  const result = state.status === "done" ? state.result : null;
  const verdict = result ? verdictOf(result) : null;

  // Clear the result by itself, and buzz the phone where the browser allows it (a different pattern for a refusal).
  useEffect(() => {
    if (verdict === null) return;
    navigator.vibrate?.(verdict === "refused" ? [200, 100, 200] : 80);
    // What a person lacks takes longer to read out to them.
    const wait = verdict !== "refused" ? SHOW_MS.served : result && !result.ok && result.missing ? SHOW_MS.missing : SHOW_MS.refused;
    const timer = setTimeout(scanAgain, wait);
    return () => clearTimeout(timer);
  }, [verdict, result, scanAgain]);

  const statusText = state.status === "sending" ? copy.staff.sending : copy.staff.hint;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      <header className="gap-space-3 flex items-end justify-between">
        <div className="min-w-0">
          <p className="type-caption text-text-subtle">{copy.staff.title}</p>
          <h1 className="type-title-xl text-foreground truncate">{name}</h1>
        </div>
        <div className="text-right">
          <p className="type-caption text-text-subtle">{copy.staff.counterLabel[kind]}</p>
          <p className="type-title-xl text-accent tabular-nums" aria-live="polite">
            {count ?? "–"}
          </p>
        </div>
      </header>

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

      <ButtonLink href={backHref} variant="ghost">
        {copy.staff.back}
      </ButtonLink>

      {result && verdict ? (
        <button
          type="button"
          autoFocus
          onClick={scanAgain}
          aria-label={copy.staff.tap}
          className={cn(
            "gap-space-4 p-space-6 pt-safe pb-safe fixed inset-0 z-50 flex flex-col items-center justify-center text-center",
            "focus-visible:outline-none",
            VERDICT_CLASSES[verdict],
          )}
        >
          <Icon name={verdict === "refused" ? "alert" : "check"} size={96} />
          {result.ok ? <p className="type-title-xl break-all text-[40px] leading-tight">{result.alias}</p> : null}
          <p className="type-title-xl text-[32px] leading-tight">
            {result.ok
              ? verdict === "served"
                ? copy.staff.results[kind].served
                : copy.staff.results[kind].already
              : copy.staff.errors[result.code].title}
          </p>
          {!result.ok && result.missing ? (
            <ul className="gap-space-2 flex flex-col">
              {servingShortfall(result.missing).map((line) => (
                <li key={line} className="type-title text-2xl leading-tight">
                  {line}
                </li>
              ))}
            </ul>
          ) : !result.ok ? (
            <p className="type-body text-lg">{copy.staff.errors[result.code].body}</p>
          ) : null}
          {result.ok && result.missions.some((mission) => mission.justCompleted) ? (
            <ul aria-label={copy.staff.missions.label} className="gap-space-2 flex flex-col">
              {result.missions
                .filter((mission) => mission.justCompleted)
                .map((mission, index) => (
                  <li key={`${index}-${mission.title}`} className="type-title text-2xl leading-tight">
                    {mission.title}
                    {mission.xpEarned > 0 ? ` · ${interpolate(copy.staff.missions.xp, { xp: formatNumber(mission.xpEarned) })}` : null}
                  </li>
                ))}
            </ul>
          ) : null}
          {result.ok && result.servedCount !== null ? (
            <p className="type-body text-lg tabular-nums">
              {copy.staff.counterLabel[kind]}: {result.servedCount}
            </p>
          ) : null}
          <p className="type-caption mt-space-6 opacity-80">{copy.staff.tap}</p>
        </button>
      ) : null}
    </div>
  );
}
