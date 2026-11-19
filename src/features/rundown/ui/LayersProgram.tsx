"use client";

import { useEffect, useState } from "react";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import { formatCounter, type CardWire, type CounterWire } from "../domain/layers";
import { cn } from "@/shared/lib/utils";

export interface LayersProgramProps {
  /** For tests: a way to open the channel instead of the browser's own. */
  openChannel?: () => StageChannel | null;
}

/** Where a layer sits: its own `x` and `y` percent of the screen decide the corner it hangs from, so it never leaves the screen. */
const placeStyle = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%`, transform: `translate(-${x}%, -${y}%)` });

const CARD_TONE: Record<CardWire["kind"], string> = { speaker: "bg-[#4285f4]", notice: "bg-[#fbbc04]" };

/** The counter as it looks: small and medium are a pill, large is the whole screen dimmed with the time in the middle. */
export function CounterView({ counter, remainingMs }: { counter: CounterWire; remainingMs: number }) {
  const time = formatCounter(remainingMs);
  if (counter.size === "lg") {
    return (
      <div role="timer" aria-label={time} className="absolute inset-0 flex flex-col items-center justify-center gap-[2vh] bg-[#1b1b1f]/70 text-center text-white" style={{ fontFamily: "var(--font-display, inherit)" }}>
        {counter.label ? <p className="text-[clamp(1.25rem,3.4vh,2.5rem)] font-bold tracking-widest text-[#fbbc04] uppercase">{counter.label}</p> : null}
        <p className="text-[clamp(5rem,30vh,20rem)] leading-[0.95] font-extrabold tabular-nums">{time}</p>
      </div>
    );
  }
  const big = counter.size === "md";
  return (
    <div
      role="timer"
      aria-label={time}
      className="absolute flex items-center gap-[1vh] rounded-full border-[3px] border-[#1b1b1f] bg-[#1b1b1f] text-[#f7f5ef] shadow-[0.7vh_0.7vh_0_#fbbc04]"
      style={{ ...placeStyle(counter.x, counter.y), padding: big ? "1.6vh 3vh 1.6vh 2.4vh" : "1vh 2.4vh 1vh 1.8vh" }}
    >
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#fbbc04" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ fontSize: big ? "5vh" : "3.4vh" }}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9 2h6" />
      </svg>
      {counter.label ? <span className="font-bold tracking-wider uppercase" style={{ fontSize: big ? "2.2vh" : "1.6vh" }}>{counter.label}</span> : null}
      <span className="font-extrabold tabular-nums" style={{ fontSize: big ? "7vh" : "4.4vh", lineHeight: 1 }}>
        {time}
      </span>
    </div>
  );
}

/** A card as it looks: a speaker's name with a blue edge, or a notice with a yellow tag. */
export function CardView({ card }: { card: CardWire }) {
  return (
    <div className="absolute flex max-w-[44%] items-stretch overflow-hidden rounded-[2.4vh] border-[3px] border-[#1b1b1f] bg-[#f7f5ef] text-[#1b1b1f] shadow-[0.8vh_0.8vh_0_#1b1b1f]" style={placeStyle(card.x, card.y)}>
      {card.kind === "speaker" ? <span className={cn("w-[1.8vh] shrink-0", CARD_TONE.speaker)} aria-hidden="true" /> : null}
      <div className="flex min-w-0 flex-col gap-[0.8vh] px-[2.6vh] py-[2vh]">
        {card.kind === "notice" ? <span className={cn("self-start rounded-full px-[1.4vh] py-[0.3vh] font-extrabold tracking-wider", CARD_TONE.notice)} style={{ fontSize: "1.6vh" }}>AVISO</span> : <span className="font-bold tracking-widest text-[#1a56c4]" style={{ fontSize: "1.8vh" }}>PONENTE</span>}
        <p className="font-extrabold" style={{ fontSize: card.kind === "speaker" ? "4.6vh" : "3.6vh", lineHeight: 1.08 }}>
          {card.title}
        </p>
        {card.text ? (
          <p className="font-medium text-[#4a4a52]" style={{ fontSize: "2.4vh", lineHeight: 1.3 }}>
            {card.text}
          </p>
        ) : null}
        {card.link ? (
          <p className="font-bold text-[#1a56c4]" style={{ fontSize: "2.2vh" }}>
            {card.link}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The layers over the big screen: the counter and the cards the console has turned on. It draws exactly what the console
 * says (the whole picture each time) and counts the time down by itself between messages, so the counter is smooth. It sits
 * over the pieces on the air and over the stage's own scenes, and never blocks a click on them. The console's small copy of the
 * screen draws the same, and says nothing back.
 */
export function LayersProgram({ openChannel = openStageChannel }: LayersProgramProps) {
  const [layers, setLayers] = useState<{ counter: CounterWire; cards: CardWire[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const line = openChannel();
    if (!line) return;
    const stop = line.subscribe((message) => {
      if (message.type === "layers") {
        setLayers({ counter: message.counter, cards: message.cards });
        setNow(Date.now());
      }
    });
    return () => {
      stop();
      line.close();
    };
  }, [openChannel]);

  const running = layers?.counter.visible === true && layers.counter.running;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  if (!layers || (!layers.counter.visible && layers.cards.length === 0)) return null;
  const { counter, cards } = layers;
  const remainingMs = counter.running ? Math.max(0, counter.remainingMs - (now - counter.sentAt)) : counter.remainingMs;
  return (
    <div className="pointer-events-none fixed inset-0 z-[250]" data-testid="layers">
      {counter.visible ? <CounterView counter={counter} remainingMs={remainingMs} /> : null}
      {cards.map((card) => (
        <CardView key={card.id} card={card} />
      ))}
    </div>
  );
}
