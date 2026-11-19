/**
 * The layers that go over whatever is on the big screen: a counter and cards. They are turned on and off from the console,
 * sit where the operator drags them (a place on the screen, in percent) and never change what is underneath: a video keeps
 * playing while a card comes and goes. Pure: every operation answers a new state, so time and moves are tested without a screen.
 */
export const CARDS_MAX = 20;
export const CARD_TITLE_MAX = 60;
export const CARD_TEXT_MAX = 160;
export const CARD_LINK_MAX = 80;
export const COUNTER_LABEL_MAX = 40;
export const COUNTER_MIN_MS = 1000;
export const COUNTER_MAX_MS = 6 * 3600 * 1000;
const CARD_ID = /^[A-Za-z0-9_-]{4,40}$/;

/** A place on the screen: `x` and `y` from 0 (left, top) to 100 (right, bottom); a layer is set so it never leaves the screen. */
export interface Place {
  x: number;
  y: number;
}

export const clampPercent = (value: number): number => (Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 : 0);
export const placeOf = (x: number, y: number): Place => ({ x: clampPercent(x), y: clampPercent(y) });

/** The places the console offers by name, besides dragging. */
export const PLACES = {
  topLeft: { x: 2, y: 3 },
  topRight: { x: 98, y: 3 },
  bottomLeft: { x: 2, y: 94 },
  bottomRight: { x: 98, y: 94 },
  center: { x: 50, y: 50 },
} as const satisfies Record<string, Place>;
export type PlaceName = keyof typeof PLACES;

// ---- the cards ----------------------------------------------------------------------------------------------------------------

export const CARD_KINDS = ["speaker", "notice"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** A card to put over the screen: a speaker's name, or a notice with an optional link. It is saved with its place. */
export interface LayerCard extends Place {
  id: string;
  kind: CardKind;
  title: string;
  text: string;
  link: string;
  /** Seconds after which the console takes it off by itself, or `null` to leave it until it is taken off. */
  hideAfter: number | null;
}

/** The default place of a new card: where each kind usually sits. */
export const defaultPlaceOf = (kind: CardKind): Place => (kind === "speaker" ? PLACES.bottomLeft : PLACES.topRight);

/** A card from stored or submitted data, or `null` when any field breaks the rules. */
export function parseCard(input: unknown): LayerCard | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.id !== "string" || !CARD_ID.test(data.id)) return null;
  if (!(CARD_KINDS as readonly unknown[]).includes(data.kind) || typeof data.title !== "string") return null;
  const title = data.title.trim();
  const text = data.text === undefined ? "" : typeof data.text === "string" ? data.text.trim() : null;
  const link = data.link === undefined ? "" : typeof data.link === "string" ? data.link.trim() : null;
  if (!title || title.length > CARD_TITLE_MAX || text === null || text.length > CARD_TEXT_MAX || link === null || link.length > CARD_LINK_MAX) return null;
  if (typeof data.x !== "number" || typeof data.y !== "number" || !Number.isFinite(data.x) || !Number.isFinite(data.y) || data.x < 0 || data.x > 100 || data.y < 0 || data.y > 100) return null;
  const hideAfter = data.hideAfter === undefined || data.hideAfter === null ? null : data.hideAfter;
  if (hideAfter !== null && (typeof hideAfter !== "number" || !Number.isInteger(hideAfter) || hideAfter < 1 || hideAfter > 600)) return null;
  return { id: data.id, kind: data.kind as CardKind, title, text, link, x: clampPercent(data.x), y: clampPercent(data.y), hideAfter };
}

/** A list of cards, or `null` when there are too many, an id repeats or any one is invalid. */
export function parseCards(input: unknown): LayerCard[] | null {
  if (!Array.isArray(input) || input.length > CARDS_MAX) return null;
  const cards: LayerCard[] = [];
  for (const entry of input) {
    const card = parseCard(entry);
    if (!card || cards.some((other) => other.id === card.id)) return null;
    cards.push(card);
  }
  return cards;
}

// ---- the counter ----------------------------------------------------------------------------------------------------------------

export const COUNTER_SIZES = ["sm", "md", "lg"] as const;
export type CounterSize = (typeof COUNTER_SIZES)[number];
export type OnZero = "stay" | "next";

export interface CounterState extends Place {
  /** Whether it is on the screen. */
  visible: boolean;
  /** The time it counts down from, in milliseconds; «Reiniciar» goes back to it. */
  totalMs: number;
  /** The time left while it is paused or stopped (while it runs, the time left is `endsAt` minus now). */
  remainingMs: number;
  /** The moment it reaches zero when it is running, or `null` when it is not. */
  endsAt: number | null;
  size: CounterSize;
  /** A line over a big counter («Empezamos en»); empty for none. */
  label: string;
  /** What happens at 00:00: it stays there, or the console takes the next piece. */
  onZero: OnZero;
}

export const INITIAL_COUNTER: CounterState = { visible: false, totalMs: 5 * 60_000, remainingMs: 5 * 60_000, endsAt: null, ...PLACES.topRight, size: "sm", label: "", onZero: "stay" };

/** The time left at a moment. */
export const remainingOf = (state: CounterState, now: number): number => (state.endsAt === null ? state.remainingMs : Math.max(0, state.endsAt - now));
export const isRunning = (state: CounterState): boolean => state.endsAt !== null;

/** Starts (or goes on): from zero it starts over from the total. Running already changes nothing. */
export function startCounter(state: CounterState, now: number): CounterState {
  if (isRunning(state)) return state;
  const left = state.remainingMs > 0 ? state.remainingMs : state.totalMs;
  return { ...state, remainingMs: left, endsAt: now + left };
}

/** Pauses it where it is. */
export function pauseCounter(state: CounterState, now: number): CounterState {
  return isRunning(state) ? { ...state, remainingMs: remainingOf(state, now), endsAt: null } : state;
}

/** Back to the total, stopped. */
export const resetCounter = (state: CounterState): CounterState => ({ ...state, remainingMs: state.totalMs, endsAt: null });

/** Sets the time it counts down from (a second to six hours); it stops and starts over from it. Anything else changes nothing. */
export function setCounterDuration(state: CounterState, ms: number): CounterState {
  return Number.isFinite(ms) && ms >= COUNTER_MIN_MS && ms <= COUNTER_MAX_MS ? { ...state, totalMs: Math.round(ms), remainingMs: Math.round(ms), endsAt: null } : state;
}

/** Adds (or takes off) time while it runs or is paused; never below zero or above six hours. */
export function addCounterTime(state: CounterState, now: number, ms: number): CounterState {
  if (!Number.isFinite(ms)) return state;
  const left = Math.min(COUNTER_MAX_MS, Math.max(0, remainingOf(state, now) + ms));
  return isRunning(state) ? { ...state, endsAt: now + left, remainingMs: left } : { ...state, remainingMs: left };
}

/** It reached zero while running: it stops there. */
export const finishCounter = (state: CounterState): CounterState => ({ ...state, remainingMs: 0, endsAt: null });

export const showCounter = (state: CounterState, visible: boolean): CounterState => (state.visible === visible ? state : { ...state, visible });
export const moveCounter = (state: CounterState, place: Place): CounterState => ({ ...state, ...placeOf(place.x, place.y) });
export const setCounterSize = (state: CounterState, size: CounterSize): CounterState => ((COUNTER_SIZES as readonly string[]).includes(size) ? { ...state, size } : state);
export const setCounterLabel = (state: CounterState, label: string): CounterState => ({ ...state, label: label.slice(0, COUNTER_LABEL_MAX) });
export const setOnZero = (state: CounterState, onZero: OnZero): CounterState => (onZero === "stay" || onZero === "next" ? { ...state, onZero } : state);

/** A time typed by a person: `m:ss`, `mm:ss` or `h:mm:ss`; a plain number is minutes. `null` when it is not a time. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (/^\d{1,3}$/.test(trimmed)) return Number(trimmed) * 60_000;
  const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return ((Number(hours ?? 0) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
}

/** `mm:ss` (or `h:mm:ss`), rounding up so it shows 00:01 until it really reaches zero. */
export function formatCounter(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${String(minutes).padStart(2, "0")}:${seconds}`;
}

// ---- what travels to the screen --------------------------------------------------------------------------------------------------

/** The counter as the screen needs it: the time left when it was sent, whether it runs, where it sits and how it looks. */
export interface CounterWire extends Place {
  visible: boolean;
  remainingMs: number;
  running: boolean;
  /** When `remainingMs` was true (the same computer's clock as the console), so the screen counts down by itself. */
  sentAt: number;
  size: CounterSize;
  label: string;
}

export function counterWire(state: CounterState, now: number): CounterWire {
  return { visible: state.visible, remainingMs: remainingOf(state, now), running: isRunning(state), sentAt: now, x: state.x, y: state.y, size: state.size, label: state.label };
}

/** A card on the screen: what to draw and where. The seconds to take it off are the console's business. */
export type CardWire = Pick<LayerCard, "id" | "kind" | "title" | "text" | "link" | "x" | "y">;

export const cardWire = ({ id, kind, title, text, link, x, y }: LayerCard): CardWire => ({ id, kind, title, text, link, x, y });
