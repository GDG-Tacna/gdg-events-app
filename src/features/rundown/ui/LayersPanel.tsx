"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { COUNTER_SIZES, formatCounter, isRunning, PLACES, type CounterSize, type CounterState, type LayerCard, type OnZero, type PlaceName } from "../domain/layers";

const t = copy.stageConsole.layers;

const BUTTON = "focus-visible:ring-ring inline-flex h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50";
const FIELD = "border-line-strong bg-surface text-foreground h-9 rounded-md border-2 px-2 text-sm";

export interface LayersPanelProps {
  counter: CounterState;
  /** The time left now, in milliseconds. */
  remainingMs: number;
  cards: readonly LayerCard[];
  /** The ids of the cards that are on the screen. */
  shown: ReadonlySet<string>;
  onToggleCounter: () => void;
  onStartPause: () => void;
  onReset: () => void;
  onAddMinute: () => void;
  /** Sets the time from what was typed; answers `false` when it is not a time (the field then goes back). */
  onDuration: (text: string) => boolean;
  onSize: (size: CounterSize) => void;
  onPlace: (place: PlaceName) => void;
  onLabel: (label: string) => void;
  onZero: (onZero: OnZero) => void;
  onToggleCard: (cardId: string) => void;
  onNewCard: () => void;
  onEditCard: (cardId: string) => void;
  onRemoveCard: (cardId: string) => void;
}

/**
 * The layers of the screen in the console: the counter (time, start, pause, restart, add a minute, size, place, what it does
 * at zero) and the cards (show, take off, edit, remove). Where each sits is set by dragging it over the «En pantalla» monitor.
 */
export function LayersPanel({ counter, remainingMs, cards, shown, onToggleCounter, onStartPause, onReset, onAddMinute, onDuration, onSize, onPlace, onLabel, onZero, onToggleCard, onNewCard, onEditCard, onRemoveCard }: LayersPanelProps) {
  const running = isRunning(counter);
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <section aria-label={t.title} className="bg-surface border-ink gap-space-3 flex shrink-0 flex-col rounded-lg border-2 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="type-pixel-heading text-text-subtle">{t.title}</h2>
        <p className="type-caption text-text-subtle">{t.help}</p>
      </div>

      <div role="group" aria-label={t.counter} className="gap-space-3 flex flex-wrap items-center">
        <span className="flex items-center gap-2">
          <span className="font-display text-foreground text-3xl font-bold tabular-nums" aria-label={interpolate(t.timeLeft, { time: formatCounter(remainingMs) })}>
            {formatCounter(remainingMs)}
          </span>
          <span className={cn("type-caption rounded-full border-2 px-2 font-semibold", counter.visible ? "border-lime bg-lime text-on-accent" : "border-line-strong text-text-subtle")}>{counter.visible ? t.onScreen : t.hidden}</span>
        </span>
        <button type="button" onClick={onToggleCounter} aria-pressed={counter.visible} className={cn(BUTTON, counter.visible ? "border-ink bg-ink text-on-ink" : "border-ink bg-gold text-on-accent")}>
          {counter.visible ? t.hide : t.show}
        </button>
        <button type="button" onClick={onStartPause} className={cn(BUTTON, "border-ink")}>
          {running ? t.pause : t.start}
        </button>
        <button type="button" onClick={onReset} className={cn(BUTTON, "border-ink")}>
          {t.reset}
        </button>
        <button type="button" onClick={onAddMinute} className={cn(BUTTON, "border-ink")}>
          {t.addMinute}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t.duration}
          <input
            type="text"
            inputMode="numeric"
            aria-label={t.duration}
            value={typed ?? formatCounter(counter.totalMs)}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => {
              if (typed !== null && typed !== formatCounter(counter.totalMs)) onDuration(typed);
              setTyped(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={cn(FIELD, "w-24 text-center font-mono")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t.size}
          <select aria-label={t.size} value={counter.size} onChange={(event) => onSize(event.target.value as CounterSize)} className={FIELD}>
            {COUNTER_SIZES.map((size) => (
              <option key={size} value={size}>
                {t.sizes[size]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t.place}
          <select aria-label={t.place} value="" onChange={(event) => event.target.value && onPlace(event.target.value as PlaceName)} className={FIELD}>
            <option value="">{t.placeDrag}</option>
            {(Object.keys(PLACES) as PlaceName[]).map((name) => (
              <option key={name} value={name}>
                {t.places[name]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t.onZero}
          <select aria-label={t.onZero} value={counter.onZero} onChange={(event) => onZero(event.target.value as OnZero)} className={FIELD}>
            <option value="stay">{t.zero.stay}</option>
            <option value="next">{t.zero.next}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t.label}
          <input type="text" aria-label={t.label} value={counter.label} maxLength={40} placeholder={t.labelPlaceholder} onChange={(event) => onLabel(event.target.value)} className={cn(FIELD, "w-44")} />
        </label>
      </div>

      <div className="border-line gap-space-2 flex flex-col border-t-2 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="type-label text-foreground">{t.cards}</h3>
          <div className="flex-1" />
          <button type="button" onClick={onNewCard} className={cn(BUTTON, "border-ink h-9 px-3")}>
            {t.newCard}
          </button>
        </div>
        {cards.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.noCards}</p> : null}
        <ul aria-label={t.cards} className="gap-space-2 flex flex-col">
          {cards.map((card) => {
            const on = shown.has(card.id);
            return (
              <li key={card.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border-2 px-2.5 py-2", on ? "border-ink bg-[#ffe7a5] text-[#1e1e1e]" : "border-line-strong")}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("type-caption font-bold tracking-wider uppercase", on ? "text-[#1e1e1e]" : "text-text-subtle")}>
                    {on ? `${t.onScreen} · ` : ""}
                    {t.kinds[card.kind]}
                    {card.hideAfter ? ` · ${interpolate(t.hidesIn, { n: String(card.hideAfter) })}` : ""}
                  </span>
                  <span className="type-label truncate">{card.title}</span>
                  {card.text ? <span className={cn("type-caption truncate", on ? "text-[#4a4a52]" : "text-text-subtle")}>{card.text}</span> : null}
                </span>
                <button type="button" onClick={() => onToggleCard(card.id)} aria-pressed={on} aria-label={interpolate(on ? t.takeOffCard : t.showCard, { title: card.title })} className={cn(BUTTON, on ? "border-ink bg-ink text-on-ink" : "border-ink bg-gold text-on-accent")}>
                  {on ? t.takeOff : t.showCardShort}
                </button>
                <button type="button" onClick={() => onEditCard(card.id)} aria-label={interpolate(t.editCard, { title: card.title })} className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring grid size-9 place-items-center rounded-md border-2">
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" onClick={() => onRemoveCard(card.id)} aria-label={interpolate(t.removeCard, { title: card.title })} className="border-danger-ink text-danger-ink hover:bg-secondary focus-visible:ring-ring grid size-9 place-items-center rounded-md border-2">
                  <Icon name="close" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
