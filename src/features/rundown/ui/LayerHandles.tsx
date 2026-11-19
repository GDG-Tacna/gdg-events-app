"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { clampPercent, type CounterSize, type Place } from "../domain/layers";

const t = copy.stageConsole.layers;

/** What can be dragged: the counter, or a card by its id. */
export type LayerTarget = { type: "counter" } | { type: "card"; id: string };

/** The size each layer takes on the screen, in percent (an estimate: the handle only has to be near what it moves). */
const COUNTER_BOX: Record<Exclude<CounterSize, "lg">, { w: number; h: number }> = { sm: { w: 15, h: 9 }, md: { w: 22, h: 14 } };
const CARD_BOX = { w: 28, h: 18 };

export interface LayerHandlesProps {
  /** The counter, when it is on the screen. A big counter fills the screen, so it has nothing to drag. */
  counter: (Place & { size: CounterSize }) | null;
  /** The cards that are on the screen. */
  cards: ReadonlyArray<Place & { id: string; title: string }>;
  /** Called while a layer is dragged or nudged, with its new place. */
  onMove: (target: LayerTarget, place: Place) => void;
  /** Called when the drag or the nudge ends (the place is saved then). */
  onMoveEnd: (target: LayerTarget) => void;
}

interface HandleProps {
  label: string;
  place: Place;
  box: { w: number; h: number };
  onMove: (place: Place) => void;
  onMoveEnd: () => void;
}

/** A frame over the small screen that can be dragged with a pointer or moved with the arrow keys (Shift for bigger steps). */
function Handle({ label, place, box, onMove, onMoveEnd }: HandleProps) {
  const drag = useRef<{ x: number; y: number; at: Place; width: number; height: number } | null>(null);

  function start(event: PointerEvent<HTMLButtonElement>) {
    const area = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!area || area.width === 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, at: place, width: area.width, height: area.height };
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const from = drag.current;
    if (!from) return;
    // A layer hangs from the corner its place names, so moving it across the whole screen moves the place by 100 / (1 - size).
    const dx = ((event.clientX - from.x) / from.width) * 100;
    const dy = ((event.clientY - from.y) / from.height) * 100;
    onMove({ x: clampPercent(from.at.x + dx / (1 - box.w / 100)), y: clampPercent(from.at.y + dy / (1 - box.h / 100)) });
  }

  function end() {
    if (!drag.current) return;
    drag.current = null;
    onMoveEnd();
  }

  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 10 : 2;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    onMove({ x: clampPercent(place.x + delta[0]), y: clampPercent(place.y + delta[1]) });
    onMoveEnd();
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={key}
      className="focus-visible:ring-ring absolute cursor-grab touch-none rounded-md border-2 border-dashed border-[#fbbc04] bg-[#fbbc04]/25 text-[10px] font-bold text-white active:cursor-grabbing focus-visible:ring-[3px] focus-visible:outline-none"
      style={{ left: `${place.x}%`, top: `${place.y}%`, width: `${box.w}%`, height: `${box.h}%`, transform: `translate(-${place.x}%, -${place.y}%)` }}
    >
      <span className="pointer-events-none truncate px-1 drop-shadow">{label}</span>
    </button>
  );
}

/**
 * Frames over the «En pantalla» monitor, one for each layer that is on the screen, to drag the counter and the cards
 * anywhere. They are the console's own controls: they draw nothing on the real screen, which is moved by what they say.
 */
export function LayerHandles({ counter, cards, onMove, onMoveEnd }: LayerHandlesProps) {
  return (
    <div className={cn("absolute inset-0")}>
      {counter && counter.size !== "lg" ? (
        <Handle label={t.moveCounter} place={counter} box={COUNTER_BOX[counter.size]} onMove={(place) => onMove({ type: "counter" }, place)} onMoveEnd={() => onMoveEnd({ type: "counter" })} />
      ) : null}
      {cards.map((card) => (
        <Handle key={card.id} label={interpolate(t.moveCard, { title: card.title })} place={card} box={CARD_BOX} onMove={(place) => onMove({ type: "card", id: card.id }, place)} onMoveEnd={() => onMoveEnd({ type: "card", id: card.id })} />
      ))}
    </div>
  );
}
