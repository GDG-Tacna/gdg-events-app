"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, InlineAlert, Skeleton, UnlockedBadges } from "@/shared/ui";
import type { CodeLanguage, Difficulty, MinigameId } from "../domain/catalog";
import type { MinigameErrorCode, MinigameOffer } from "../domain/plays";
import { GAMES } from "./games/registry";
import type { GameProps } from "./games/shared";
import type { FinishMinigameAction, StartMinigameAction } from "./play-actions";

export interface MinigamePlayerProps {
  missionId: string;
  offer: MinigameOffer;
  start: StartMinigameAction;
  finish: FinishMinigameAction;
  /** The mission's screen, where the attendee goes back. */
  backHref: string;
  /** The Logros tab, linked from a badge a win unlocks (absent when achievements are off). */
  achievementsHref?: string;
  /** The games, replaceable in tests. */
  games?: Partial<Record<MinigameId, ComponentType<GameProps>>>;
}

type Phase =
  | { name: "intro" }
  | { name: "starting" }
  | { name: "countdown"; left: number; ticket: Ticket }
  | { name: "playing"; ticket: Ticket }
  | { name: "sending"; won: boolean }
  | { name: "result"; won: boolean; xp: number; badges: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }> };

interface Ticket {
  gameId: MinigameId;
  difficulty: Difficulty;
  codeLanguages: readonly CodeLanguage[];
}

/**
 * The frame every game runs in: intro with how to play and the reward, a 3-2-1 countdown, the game (paused while
 * the tab is hidden), and the result. The server issues the ticket and takes the result once; the frame only
 * carries the game's "won or lost" to it, and retries the send if the connection drops.
 */
export function MinigamePlayer({ missionId, offer, start, finish, backHref, achievementsHref, games = GAMES }: MinigamePlayerProps) {
  const t = copy.minigames;
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [error, setError] = useState<MinigameErrorCode | null>(null);
  const [paused, setPaused] = useState(false);
  const Game = games[offer.gameId];

  // Hiding the tab pauses the game; coming back shows the pause screen until the attendee continues.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (phase.name !== "countdown") return;
    const timer = setTimeout(() => setPhase(phase.left > 1 ? { ...phase, left: phase.left - 1 } : { name: "playing", ticket: phase.ticket }), 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  async function begin() {
    setError(null);
    setPhase({ name: "starting" });
    let result;
    try {
      result = await start({ missionId });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    if (!result.ok) {
      setError(result.code);
      setPhase({ name: "intro" });
      return;
    }
    setPhase({ name: "countdown", left: 3, ticket: { gameId: result.gameId, difficulty: result.difficulty, codeLanguages: result.codeLanguages } });
  }

  const sending = useRef(false);
  const send = useCallback(
    async (won: boolean) => {
      if (sending.current) return;
      sending.current = true;
      setError(null);
      setPhase({ name: "sending", won });
      let result;
      try {
        result = await finish({ missionId, won });
      } catch {
        result = { ok: false as const, code: "unknown" as const };
      }
      sending.current = false;
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setPhase({ name: "result", won: result.status === "won", xp: result.status === "won" ? result.xpBonus : offer.xpBonus, badges: result.achievements });
    },
    [finish, missionId, offer.xpBonus],
  );

  const xp = formatNumber(offer.xpBonus);
  const name = t.names[offer.gameId];

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-1 flex flex-col">
        <p className="type-caption text-text-subtle">{t.offer.label}</p>
        <h1 className="type-title text-foreground">{name}</h1>
      </header>

      {error ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      {phase.name === "intro" || phase.name === "starting" ? (
        <Card className="gap-space-4 flex flex-col">
          <div className="gap-space-2 flex flex-wrap items-center">
            <span className="type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1">{t.difficulty[offer.difficulty]}</span>
            <span className="type-pixel-tag text-accent">{interpolate(t.intro.reward, { xp })}</span>
          </div>
          <p className="type-body text-foreground">{t.howTo[offer.gameId]}</p>
          <p className="type-caption text-text-subtle">{offer.state === "in-play" ? t.offer.inPlay : t.intro.oneTry}</p>
          {Game ? (
            <Button size="lg" block loading={phase.name === "starting"} onClick={() => void begin()}>
              {phase.name === "starting" ? t.intro.starting : offer.state === "in-play" ? t.offer.continue : t.intro.start}
            </Button>
          ) : (
            <InlineAlert>{t.errors["not-available"]}</InlineAlert>
          )}
          <ButtonLink href={backHref} variant="ghost">
            {t.intro.back}
          </ButtonLink>
        </Card>
      ) : null}

      {phase.name === "countdown" ? (
        <p aria-live="assertive" className="type-pixel-callout text-primary py-space-8 text-center text-[64px] leading-none">
          {phase.left}
        </p>
      ) : null}

      {phase.name === "playing" && Game ? (
        <div className="relative">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <Game difficulty={phase.ticket.difficulty} codeLanguages={phase.ticket.codeLanguages} paused={paused} onFinish={(won) => void send(won)} />
          </Suspense>
          {paused ? (
            <div role="dialog" aria-modal="true" aria-labelledby="minigame-paused" className="bg-background/95 p-space-5 gap-space-3 absolute inset-0 flex flex-col items-center justify-center rounded-lg text-center">
              <h2 id="minigame-paused" className="type-title text-foreground">
                {t.paused.title}
              </h2>
              <p className="type-body text-muted-foreground">{t.paused.body}</p>
              <Button autoFocus onClick={() => setPaused(false)}>
                {t.paused.resume}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase.name === "sending" ? (
        <Card className="gap-space-4 flex flex-col">
          <p aria-live="polite" className="type-body text-foreground">
            {t.result.sending}
          </p>
          {error ? <Button onClick={() => void send(phase.won)}>{t.result.retry}</Button> : null}
        </Card>
      ) : null}

      {phase.name === "result" ? (
        <Card className="gap-space-4 flex flex-col items-center text-center">
          <h2 className="type-title-xl text-foreground" tabIndex={-1} ref={(node) => node?.focus()}>
            {phase.won ? t.result.won : t.result.lost}
          </h2>
          <p className={phase.won ? "type-pixel-callout text-accent" : "type-body text-muted-foreground"}>
            {phase.won ? interpolate(t.result.wonBody, { xp: formatNumber(phase.xp) }) : interpolate(t.result.lostBody, { xp })}
          </p>
          <UnlockedBadges badges={phase.badges} href={achievementsHref} />
          <ButtonLink href={backHref} variant="primary" block>
            {t.result.back}
          </ButtonLink>
        </Card>
      ) : null}
    </div>
  );
}
