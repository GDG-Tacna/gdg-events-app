"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { computeFleetBoard, type FleetBoard, type RankingEntry } from "../../domain/ranking";
import type { StageState } from "../../domain/stage";
import type { FeedStatus, StageFeed } from "../../domain/stage-feed";
import { CadetBoard, RaffleScreen, RevealScreen, SquadBoard, WaitingScreen, type SquadSprites, type UpNext } from "./stage-parts";

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
  /** False when the edition has squads switched off: only the cadets' ranking shows, whatever the view says. */
  squadsOn?: boolean;
  /** Draws a poll's live results (the polls feature, wired by the app shell); without it a poll display shows nothing. */
  renderPoll?: (pollId: string) => ReactNode;
  /** Draws a talk's attendance QR (the ephemeral QR feature, wired by the app shell); without it a talk QR display shows nothing. */
  renderTalkQr?: (talk: { talkId: string; name: string; speaker: string }) => ReactNode;
  /** The day's talks in order, so the waiting screen can announce the next one and the QR can name the speaker. Without them it shows the event's name. */
  agenda?: readonly { id: string; time: string; title: string; who: string }[];
}

/** The scene's own colors: the waiting screen is dark and the raffle blue, the rest sit on the page's base. */
const TONE = { base: "", ink: "bg-ink text-on-ink", blue: "bg-[#1a73e8] text-white" } as const;

const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const t = copy.stage;

function StatusPill({ status }: { status: FeedStatus }) {
  if (status === "signed-out" || status === "denied") return null;
  return (
    <span role="status" className="flex items-center gap-2 rounded-full border-2 border-current px-4 py-1 text-[clamp(0.85rem,2vh,1.5rem)] font-bold">
      <span aria-hidden="true" className={cn("size-[1.2vh] min-h-2 min-w-2 rounded-full", status === "live" ? "bg-lime" : "bg-gold animate-pulse")} />
      {t.status[status]}
    </span>
  );
}

/**
 * The stage screen: full screen on the projector, opened with an admin session. It listens live to the stage the
 * admin controls and to the edition's participants, and computes the ranking itself; it shows the live or frozen
 * ranking (cadets, squads, or both taking turns), a waiting screen, or the champions' reveal. It only reads.
 */
export function StageScreen({ eventId, feed, squads, sprites, initialStage, initialBoard, alternateMs = 15_000, squadsOn = true, renderPoll, renderTalkQr, agenda = [] }: StageScreenProps) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(initialStage);
  const [entries, setEntries] = useState<readonly RankingEntry[] | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [turn, setTurn] = useState<"cadets" | "squads">("cadets");
  const [fullscreen, setFullscreen] = useState(false);
  // The clock of this computer (the projector's): the next talk is the first one after now.
  const [now, setNow] = useState(() => hhmm(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setNow(hhmm(new Date())), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => feed.subscribe(eventId, { stage: setStage, participants: setEntries, status: setStatus }), [feed, eventId]);

  const view = squadsOn ? stage.view : "cadets";

  // "Both" takes turns: cadets, then squads.
  useEffect(() => {
    if (view !== "both") return;
    const timer = setInterval(() => setTurn((current) => (current === "cadets" ? "squads" : "cadets")), alternateMs);
    return () => clearInterval(timer);
  }, [view, alternateMs]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const live = useMemo(() => (entries ? computeFleetBoard(entries, squads) : initialBoard), [entries, squads, initialBoard]);
  const board = stage.frozen ?? live;
  const shown = view === "both" ? turn : view;
  const upNext: UpNext | null = useMemo(() => agenda.find((point) => point.time !== "" && point.time > now) ?? null, [agenda, now]);
  const tone = stage.display === "waiting" ? "ink" : stage.display === "raffle" && stage.raffle ? "blue" : "base";

  if (status === "signed-out" || status === "denied") {
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <Icon name="lock" size={48} className="text-gold-ink" />
        <p className="font-display text-3xl font-bold">{t.errors[status].title}</p>
        <p className="text-muted-foreground max-w-[60ch] text-xl">{t.errors[status].body}</p>
      </div>
    );
  }

  return (
    <>
      {stage.background ? (
        // The admin's picture behind everything, darkened so the ranking reads on any image.
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.background.url} alt="" className="size-full object-cover" />
          <div className="bg-bg-deep/70 absolute inset-0" />
        </div>
      ) : null}
      {/* A proportional line height: the body's is fixed in pixels and would clip the big projector type. */}
      <div className={cn("relative z-10 flex min-h-dvh flex-col gap-[2.4vh] px-[4vw] py-[3.5vh] leading-[1.25]", stage.background && tone === "base" ? "" : tone === "base" ? "bg-background text-foreground" : TONE[tone])}>
        <h1 className="sr-only">{t.title}</h1>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-[1.2vw]">
            <span aria-hidden="true" className="flex gap-[0.4vw]">
              <span className="bg-violet size-[1.6vh] min-h-3 min-w-3 rounded-full" />
              <span className="bg-destructive size-[1.6vh] min-h-3 min-w-3 rounded-full" />
              <span className="bg-gold size-[1.6vh] min-h-3 min-w-3 rounded-full" />
              <span className="bg-lime size-[1.6vh] min-h-3 min-w-3 rounded-full" />
            </span>
            <p className="text-[clamp(0.95rem,2.4vh,1.75rem)] font-bold tracking-wider opacity-80">{t.event}</p>
          </div>
          <div className="flex items-center gap-3">
            {stage.frozen && stage.display === "ranking" ? (
              <span className="border-gold text-gold-ink rounded-full border-2 px-4 py-1 text-[clamp(0.9rem,2vh,1.6rem)] font-bold">{t.frozen}</span>
            ) : null}
            <StatusPill status={status} />
            {!fullscreen ? (
              <button
                type="button"
                onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
                className="border-current hover:bg-secondary/30 focus-visible:ring-ring min-h-12 rounded-full border-2 px-5 font-bold focus-visible:ring-[3px] focus-visible:outline-none"
              >
                {t.fullscreen}
              </button>
            ) : null}
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          {stage.display === "waiting" ? <WaitingScreen next={upNext} /> : null}
          {stage.display === "reveal" ? <RevealScreen champions={stage.champions} sprites={sprites} /> : null}
          {stage.display === "raffle" && stage.raffle ? <RaffleScreen key={stage.raffle.drawId} raffle={stage.raffle} /> : null}
          {stage.display === "poll" && stage.poll && renderPoll ? <div key={stage.poll.pollId} className="flex flex-1 flex-col">{renderPoll(stage.poll.pollId)}</div> : null}
          {stage.display === "talk-qr" && stage.talk && renderTalkQr ? <div key={stage.talk.talkId} className="flex flex-1 flex-col">{renderTalkQr({ ...stage.talk, speaker: agenda.find((point) => point.id === stage.talk?.talkId)?.who ?? "" })}</div> : null}
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
                <div className="flex flex-wrap items-end justify-between gap-x-6">
                  <h2 className="font-display text-[clamp(2rem,7vh,4.75rem)] leading-[1.05] font-extrabold">{shown === "cadets" ? t.cadetsHeading : t.squadsHeading}</h2>
                  <p className="text-muted-foreground text-[clamp(0.95rem,2.4vh,1.75rem)] font-medium">{shown === "cadets" ? t.cadetsSubtitle : t.squadsSubtitle}</p>
                </div>
                {shown === "cadets" ? <CadetBoard cadets={board.cadets} /> : <SquadBoard squads={board.squads} sprites={sprites} />}
                <div className="text-muted-foreground mt-auto flex items-center justify-between text-[clamp(0.85rem,2vh,1.5rem)] font-medium">
                  <span>{view === "both" ? (shown === "cadets" ? t.showing.cadetsThen : t.showing.squadsThen) : shown === "cadets" ? t.showing.cadets : t.showing.squads}</span>
                  {view === "both" ? (
                    <span aria-hidden="true" className="flex items-center gap-2">
                      <span className={cn("h-2 rounded-full transition-all", shown === "cadets" ? "bg-ink w-7" : "bg-line-strong w-2")} />
                      <span className={cn("h-2 rounded-full transition-all", shown === "squads" ? "bg-ink w-7" : "bg-line-strong w-2")} />
                    </span>
                  ) : null}
                </div>
              </motion.section>
            </AnimatePresence>
          ) : null}
        </main>
      </div>
    </>
  );
}
