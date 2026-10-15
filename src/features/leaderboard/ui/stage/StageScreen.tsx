"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { computeFleetBoard, type FleetBoard, type RankingEntry } from "../../domain/ranking";
import type { StageState } from "../../domain/stage";
import type { FeedStatus, StageFeed } from "../../domain/stage-feed";
import { CadetBoard, RaffleScreen, RevealScreen, SquadBoard, WaitingScreen, type SquadSprites } from "./stage-parts";

export interface StageSquad {
  id: string;
  name: string;
  active: boolean;
}

export interface StageScreenProps {
  eventId: string;
  feed: StageFeed;
  squads: readonly StageSquad[];
  sprites: SquadSprites;
  /** The stage and the ranking as the server read them, so the first frame is never empty. */
  initialStage: StageState;
  initialBoard: FleetBoard | null;
  /** How long each ranking shows when the view is "both". */
  alternateMs?: number;
}

const t = copy.stage;

function StatusPill({ status }: { status: FeedStatus }) {
  if (status === "signed-out" || status === "denied") return null;
  return (
    <span role="status" className="border-line-strong text-muted-foreground flex items-center gap-2 rounded-full border px-4 py-1 text-[clamp(0.85rem,1.8vh,1.4rem)]">
      <span aria-hidden="true" className={cn("size-[1.2vh] min-h-2 min-w-2 rounded-full", status === "live" ? "bg-accent" : "bg-gold animate-pulse")} />
      {t.status[status]}
    </span>
  );
}

/**
 * The stage screen: full screen on the projector, opened with an admin session. It listens live to the stage the
 * admin controls and to the edition's participants, and computes the ranking itself; it shows the live or frozen
 * ranking (cadets, squads, or both taking turns), a waiting screen, or the champions' reveal. It only reads.
 */
export function StageScreen({ eventId, feed, squads, sprites, initialStage, initialBoard, alternateMs = 15_000 }: StageScreenProps) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(initialStage);
  const [entries, setEntries] = useState<readonly RankingEntry[] | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [turn, setTurn] = useState<"cadets" | "squads">("cadets");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => feed.subscribe(eventId, { stage: setStage, participants: setEntries, status: setStatus }), [feed, eventId]);

  // "Both" takes turns: cadets, then squads.
  useEffect(() => {
    if (stage.view !== "both") return;
    const timer = setInterval(() => setTurn((current) => (current === "cadets" ? "squads" : "cadets")), alternateMs);
    return () => clearInterval(timer);
  }, [stage.view, alternateMs]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const live = useMemo(() => (entries ? computeFleetBoard(entries, squads) : initialBoard), [entries, squads, initialBoard]);
  const board = stage.frozen ?? live;
  const shown = stage.view === "both" ? turn : stage.view;

  if (status === "signed-out" || status === "denied") {
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <Icon name="lock" size={48} className="text-gold" />
        <p className="font-display text-3xl font-bold">{t.errors[status].title}</p>
        <p className="text-muted-foreground max-w-[60ch] text-xl">{t.errors[status].body}</p>
      </div>
    );
  }

  return (
    // A proportional line height: the body's is fixed in pixels and would clip the big projector type.
    <div className="flex min-h-dvh flex-col gap-[3vh] px-[4vw] py-[3vh] leading-[1.25]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col">
          <p className="text-primary text-[clamp(0.9rem,2vh,1.6rem)] font-semibold tracking-widest uppercase">{t.event}</p>
          <h1 className="font-display text-[clamp(1.75rem,5vh,4.5rem)] leading-tight font-bold">{t.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {stage.frozen && stage.display === "ranking" ? (
            <span className="type-pixel-tag border-gold text-gold rounded-full border px-4 py-1 text-[clamp(0.9rem,2vh,1.6rem)]">{t.frozen}</span>
          ) : null}
          <StatusPill status={status} />
          {!fullscreen ? (
            <button
              type="button"
              onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
              className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring min-h-12 rounded-md border px-4 focus-visible:ring-[3px] focus-visible:outline-none"
            >
              {t.fullscreen}
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {stage.display === "waiting" ? <WaitingScreen /> : null}
        {stage.display === "reveal" ? <RevealScreen champions={stage.champions} sprites={sprites} /> : null}
        {stage.display === "raffle" && stage.raffle ? <RaffleScreen key={stage.raffle.drawId} raffle={stage.raffle} /> : null}
        {stage.display === "ranking" && board ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={shown}
              aria-label={shown === "cadets" ? t.cadetsTitle : t.squadsTitle}
              initial={reduce ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="flex flex-1 flex-col gap-[2.5vh]"
            >
              <h2 className="text-muted-foreground text-[clamp(1rem,2.6vh,2.25rem)] font-semibold tracking-wide uppercase">{shown === "cadets" ? t.cadetsTitle : t.squadsTitle}</h2>
              {shown === "cadets" ? <CadetBoard cadets={board.cadets} /> : <SquadBoard squads={board.squads} sprites={sprites} />}
            </motion.section>
          </AnimatePresence>
        ) : null}
      </main>
    </div>
  );
}
