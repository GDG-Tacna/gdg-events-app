"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScanReticle, useScanSession, type QrCamera } from "@/features/scanner";
import { ticketName, type TicketType } from "@/features/tickets";
import { copy } from "@/shared/copy/es";
import { rankWithLevel } from "@/shared/copy/rank-name";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Icon, Thumbnail } from "@/shared/ui";
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
  /** What the station is, under its name (empty or absent when it has none). */
  description?: string;
  /** The address of its logo or photo, next to its name. */
  image?: string | null;
  /** Cadets scanned here so far, or `null` when it could not be read. */
  initialCount: number | null;
  /** Where "Cambiar de puesto" goes. */
  backHref: string;
  /** The back button's text ("Cambiar de puesto" when absent). */
  backLabel?: string;
  /** Where "Cambiar entrada" goes (staff change a cadet's ticket there). Absent hides the link. */
  changeTicketHref?: string;
  /** The open puestos this person may operate, for the row that switches between them. Fewer than two hides the row. */
  stations?: readonly { id: string; name: string }[];
  /** Where each station's scanner lives (`${stationBase}/${id}`). Needed for the row to show. A plain path: a client component cannot receive functions from a server page. */
  stationBase?: string;
}

const FAILED: ServeActionResult = { ok: false, code: "unknown" };

/** How long a result stays up before the camera looks for the next person. A tap skips the wait. */
const SHOW_MS = { served: 1800, refused: 3200, missing: 5000, ticket: 9000 } as const;

type Verdict = "served" | "already" | "refused";

/** What the person lacks, said to the staff ("Le falta llegar a Piloto (NV 2)", "Le faltan 2 charlas más", "Necesita entrada Premium"). */
export function servingShortfall(missing: { level: number | null; levelName: string | null; talks: number | null; ticket: TicketType | null }): string[] {
  const lines: string[] = [];
  if (missing.level !== null) lines.push(interpolate(copy.staff.missing.level, { rank: rankWithLevel(missing.level, missing.levelName) }));
  if (missing.talks !== null) lines.push(missing.talks === 1 ? copy.staff.missing.talksOne : interpolate(copy.staff.missing.talksMany, { n: formatNumber(missing.talks) }));
  if (missing.ticket !== null && missing.ticket !== "general") lines.push(copy.staff.missing.ticket[missing.ticket]);
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
export function ServeScreen({ camera: Camera, serve, checkpointId, kind, name, description, image, initialCount, backHref, backLabel, changeTicketHref, stations, stationBase }: ServeScreenProps) {
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
    const wait = verdict !== "refused" ? SHOW_MS.served : result && !result.ok && result.missing ? (result.missing.ticket !== null && changeTicketHref ? SHOW_MS.ticket : SHOW_MS.missing) : SHOW_MS.refused;
    const timer = setTimeout(scanAgain, wait);
    return () => clearTimeout(timer);
  }, [verdict, result, scanAgain, changeTicketHref]);

  const statusText = state.status === "sending" ? copy.staff.sending : copy.staff.hint;

  return (
    <div className="gap-space-4 mx-auto flex w-full max-w-[520px] flex-col">
      {stationBase && stations && stations.length > 1 ? (
        <nav aria-label={copy.staff.listLabel} className="gap-space-2 -mx-space-1 px-space-1 flex overflow-x-auto pb-1">
          {stations.map((station) => (
            <Link
              key={station.id}
              href={`${stationBase}/${station.id}`}
              aria-current={station.id === checkpointId ? "page" : undefined}
              className={cn(
                "type-label border-ink px-space-4 focus-visible:ring-ring inline-flex h-10 shrink-0 items-center rounded-full border-2 whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none",
                station.id === checkpointId ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-pastel-blue hover:text-on-accent",
              )}
            >
              {station.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <header className="gap-space-3 flex items-end justify-between">
        <div className="gap-space-3 flex min-w-0 items-center">
          {image ? <Thumbnail url={image} size={48} /> : null}
          <div className="min-w-0">
            <p className="type-caption text-text-subtle">{copy.staff.title}</p>
            <h1 className="type-title-xl text-foreground truncate">{name}</h1>
            {description ? <p className="type-body-sm text-muted-foreground line-clamp-2">{description}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="type-caption text-text-subtle">{copy.staff.counterLabel[kind]}</p>
          <p className="type-title-xl text-lime-ink tabular-nums" aria-live="polite">
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
            <Icon name="loading" size={40} className="text-cyan-ink" />
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
        {backLabel ?? copy.staff.back}
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
          {result.ok ? <p className="type-title text-2xl leading-tight">{interpolate(copy.staff.ticket, { name: ticketName(result.ticketType) })}</p> : null}
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
      {/* Outside the verdict's button (a link cannot sit inside one): for a cadet who has not got the ticket the meal asks for, e.g. who buys it now. */}
      {result && !result.ok && result.missing && result.missing.ticket !== null && changeTicketHref ? (
        <div className="pb-safe px-space-6 pt-space-4 fixed inset-x-0 bottom-0 z-[60] flex justify-center">
          <ButtonLink href={changeTicketHref} variant="secondary" className="w-full max-w-[520px]">
            {copy.staff.changeTicketLink}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
