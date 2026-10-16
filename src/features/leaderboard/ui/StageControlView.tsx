"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ImageField, type UploadImageAction } from "@/features/media";
import { Button, ButtonLink, Card, InlineAlert } from "@/shared/ui";
import type { FleetBoard } from "../domain/ranking";
import { STAGE_VIEWS, type StageCommand, type StageState } from "../domain/stage";
import type { UpdateStageAction, UpdateStageActionResult } from "./stage-actions";

export interface StageControlViewProps {
  stage: StageState;
  /** The ranking as it stands now, for the preview; `null` when it could not be read. */
  live: FleetBoard | null;
  run: UpdateStageAction;
  /** The stage screen for the projector, opened in a new tab. */
  screenHref?: string;
  /** False when the edition has squads switched off: the screen only shows cadets, so there is no view to pick. */
  squadsOn?: boolean;
  /** Uploads the projector's background; without it the background cannot be changed here. */
  upload?: UploadImageAction;
  /** The polls that were opened, to put one's results on screen; absent when the edition has polls off. */
  polls?: ReadonlyArray<{ id: string; question: string; status: "open" | "closed" }>;
}

const PREVIEW_SIZE = 5;
const formatTime = (at: Date) => new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EDITION.timeZone }).format(new Date(at));

/** A two-state button for the choices of one group (what is shown, which view). */
function Choice({ pressed, disabled, onClick, children }: { pressed: boolean; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "type-label focus-visible:ring-ring min-h-12 flex-1 rounded-md border px-3 focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60",
        pressed ? "bg-primary text-primary-foreground border-primary" : "border-line-strong text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function BoardPreview({ board, label }: { board: FleetBoard; label: string }) {
  const t = copy.admin.stage;
  const cadets = board.cadets.slice(0, PREVIEW_SIZE);
  return (
    <div className="gap-space-4 flex flex-col">
      <p className="type-caption text-text-subtle">{label}</p>
      {cadets.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.previewEmpty}</p> : null}
      <div className="gap-space-4 grid min-[520px]:grid-cols-2">
        {cadets.length > 0 ? (
          <ol aria-label={t.previewCadets} className="gap-space-1 flex flex-col">
            {cadets.map((cadet) => (
              <li key={cadet.position} className="gap-space-2 flex min-w-0 justify-between">
                <span className="type-body-sm text-foreground truncate">
                  {cadet.position}. {cadet.alias}
                </span>
                <span className="type-body-sm text-accent shrink-0 tabular-nums">{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {board.squads.length > 0 ? (
          <ol aria-label={t.previewSquads} className="gap-space-1 flex flex-col">
            {board.squads.map((squad) => (
              <li key={squad.id} className="gap-space-2 flex min-w-0 justify-between">
                <span className="type-body-sm text-foreground truncate">
                  {squad.position}. {squad.name}
                </span>
                <span className="type-body-sm text-accent shrink-0 tabular-nums">{interpolate(t.xp, { n: formatNumber(squad.xp) })}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The "Escenario" screen: what the big screen shows now and the admin's controls (ranking or waiting screen, the
 * view, freezing, and the champions' reveal behind a confirmation). Every change is a server command.
 */
export function StageControlView({ stage, live, run, screenHref, squadsOn = true, upload, polls }: StageControlViewProps) {
  const t = copy.admin.stage;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function send(command: StageCommand) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    let result: UpdateStageActionResult;
    try {
      result = await run(command);
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: t.errors[result.code] });
      return;
    }
    setNotice({ kind: "success", text: t.done });
    router.refresh();
  }

  const now =
    stage.display === "waiting"
      ? t.now.waiting
      : stage.display === "reveal"
        ? t.now.reveal
        : stage.display === "raffle" && stage.raffle
          ? interpolate(t.now.raffle, { prize: stage.raffle.prizeName })
          : stage.display === "poll"
          ? t.now.poll
          : stage.frozen
          ? interpolate(t.now.frozen, { time: formatTime(stage.frozen.at) })
          : t.now.live;
  const board = stage.frozen ?? live;

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <Card tone="cyan" className="gap-space-3 flex flex-col">
        <div className="gap-space-1 flex flex-col">
          <p className="type-caption text-text-subtle">{t.nowLabel}</p>
          <p className="type-title text-foreground">{now}</p>
        </div>
        {screenHref ? (
          <div className="gap-space-2 flex flex-col">
            <ButtonLink href={screenHref} target="_blank" rel="noopener" variant="secondary">
              {copy.stage.openFromAdmin}
            </ButtonLink>
            <p className="type-caption text-text-subtle">{copy.stage.openHelp}</p>
          </div>
        ) : null}
      </Card>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.showTitle}</h2>
        <div role="group" aria-label={t.showTitle} className="gap-space-2 flex flex-wrap">
          <Choice pressed={stage.display === "ranking"} disabled={pending} onClick={() => void send({ type: "show", display: "ranking" })}>
            {t.showRanking}
          </Choice>
          <Choice pressed={stage.display === "waiting"} disabled={pending} onClick={() => void send({ type: "show", display: "waiting" })}>
            {t.showWaiting}
          </Choice>
        </div>
      </Card>

      {polls ? (
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-heading text-foreground">{t.pollTitle}</h2>
          <p className="type-body-sm text-muted-foreground">{t.pollHelp}</p>
          {polls.length === 0 ? (
            <p className="type-body-sm text-text-subtle">{t.pollNone}</p>
          ) : (
            <ul aria-label={t.pollListLabel} className="divide-border flex flex-col divide-y">
              {polls.map((poll) => {
                const shown = stage.display === "poll" && stage.poll?.pollId === poll.id;
                return (
                  <li key={poll.id} className="gap-space-3 py-space-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="type-label text-foreground">{poll.question}</p>
                      <p className="type-caption text-text-subtle">{t.pollStatus[poll.status]}</p>
                    </div>
                    <div className="flex w-32 shrink-0">
                      <Choice pressed={shown} disabled={pending || shown} onClick={() => void send({ type: "poll", pollId: poll.id })}>
                        {shown ? t.pollShown : t.pollShow}
                      </Choice>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {squadsOn ? (
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-heading text-foreground">{t.viewTitle}</h2>
          <div role="group" aria-label={t.viewTitle} className="gap-space-2 flex flex-wrap">
            {STAGE_VIEWS.map((view) => (
              <Choice key={view} pressed={stage.view === view} disabled={pending} onClick={() => void send({ type: "view", view })}>
                {t.views[view]}
              </Choice>
            ))}
          </div>
        </Card>
      ) : null}

      {upload ? (
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-heading text-foreground">{t.backgroundTitle}</h2>
          <p className="type-body-sm text-muted-foreground">{t.backgroundHelp}</p>
          {/* Saved as soon as it is uploaded or removed: the projector changes at once. */}
          <ImageField
            label={t.backgroundLabel}
            purpose="stage-background"
            value={stage.background}
            upload={upload}
            disabled={pending}
            appliesAtOnce
            onChange={(image) => void send({ type: "background", path: image?.path ?? null })}
          />
        </Card>
      ) : null}

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.freezeTitle}</h2>
        <p className="type-body-sm text-muted-foreground">{t.freezeHelp}</p>
        {stage.frozen ? (
          <Button variant="secondary" loading={pending} onClick={() => void send({ type: "unfreeze" })}>
            {pending ? t.working : t.unfreeze}
          </Button>
        ) : (
          <Button variant="secondary" loading={pending} onClick={() => void send({ type: "freeze" })}>
            {pending ? t.working : t.freeze}
          </Button>
        )}
      </Card>

      <Card className="gap-space-3 flex flex-col">
        <h2 className="type-heading text-foreground">{t.revealTitle}</h2>
        <p className="type-body-sm text-muted-foreground">{t.revealHelp}</p>
        {stage.display === "reveal" && stage.champions ? (
          <dl aria-label={t.championsLabel} className="gap-space-2 grid grid-cols-[auto_minmax(0,1fr)]">
            <dt className="type-label text-text-subtle">{t.championCadet}</dt>
            <dd className="type-label text-foreground truncate">{stage.champions.cadet ? `${stage.champions.cadet.alias} · ${interpolate(t.xp, { n: formatNumber(stage.champions.cadet.xp) })}` : t.noChampion}</dd>
            <dt className="type-label text-text-subtle">{t.championSquad}</dt>
            <dd className="type-label text-foreground truncate">{stage.champions.squad ? stage.champions.squad.name : t.noChampion}</dd>
          </dl>
        ) : null}
        {stage.display === "reveal" ? (
          <Button variant="secondary" loading={pending} onClick={() => void send({ type: "show", display: "ranking" })}>
            {t.backToRanking}
          </Button>
        ) : confirming ? (
          <div className="gap-space-3 flex flex-col">
            <p role="alert" className="type-body-sm text-foreground">
              {t.revealConfirm}
            </p>
            <div className="gap-space-2 flex flex-wrap">
              <Button loading={pending} onClick={() => void send({ type: "reveal" })} className="flex-1">
                {pending ? t.working : t.revealYes}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)} className="flex-1">
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            {t.reveal}
          </Button>
        )}
      </Card>

      {board ? (
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-heading text-foreground">{t.previewTitle}</h2>
          <BoardPreview board={board} label={stage.frozen ? t.previewFrozen : t.previewLive} />
        </Card>
      ) : null}
    </div>
  );
}
