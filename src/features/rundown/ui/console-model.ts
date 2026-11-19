/** The quick scenes, in the order of the keys (F1 to F8) and of the buttons on the console. */
export const DECK_KEYS = ["ranking", "poll", "reveal", "raffle", "qr", "waiting", "freeze", "view"] as const;
export type DeckKeyId = (typeof DECK_KEYS)[number];

/** The scenes that need a second press: showing the winners by mistake in front of the audience cannot be undone. */
export const NEEDS_CONFIRMATION: ReadonlySet<DeckKeyId> = new Set<DeckKeyId>(["reveal"]);

/** How long a first press waits for the second, in milliseconds. */
export const CONFIRM_WINDOW_MS = 4000;

export type ConsoleAction =
  | { type: "playPause" }
  | { type: "forward" }
  | { type: "back" }
  | { type: "take" }
  | { type: "stop" }
  | { type: "pickPrevious" }
  | { type: "pickNext" }
  | { type: "deck"; key: DeckKeyId }
  | { type: "slide"; slide: number }
  | { type: "toggleLoop" }
  | { type: "mute" }
  | { type: "volume"; volume: number }
  /** Back to the start of the video on the air. */
  | { type: "restart" }
  | { type: "seek"; seconds: number };

/** What a key does on the console, or `null` for a key it does not use. */
export function actionForKey(key: string): ConsoleAction | null {
  switch (key) {
    case " ":
      return { type: "playPause" };
    case "ArrowRight":
      return { type: "forward" };
    case "ArrowLeft":
      return { type: "back" };
    case "Enter":
      return { type: "take" };
    case "Escape":
      return { type: "stop" };
    case "ArrowUp":
      return { type: "pickPrevious" };
    case "ArrowDown":
      return { type: "pickNext" };
    default: {
      const function_ = /^F([1-8])$/.exec(key);
      if (function_) return { type: "deck", key: DECK_KEYS[Number(function_[1]) - 1] };
      return /^[1-9]$/.test(key) ? { type: "slide", slide: Number(key) } : null;
    }
  }
}

/** Whether a key press belongs to a text field or a dialog (the console leaves it alone). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role='dialog']") !== null;
}

export type StageViewName = "cadets" | "squads" | "both";

/** The ranking's next view: cadets, then squads, then both. */
export const nextView = (view: StageViewName): StageViewName => (view === "cadets" ? "squads" : view === "squads" ? "both" : "cadets");

/** The slides of the strip: a window of up to `size` slides that keeps the current one in it. */
export function slideWindow(current: number, total: number, size = 9): number[] {
  if (total <= 0) return [];
  const first = Math.max(1, Math.min(current - Math.floor(size / 2), total - size + 1));
  return Array.from({ length: Math.min(size, total) }, (_, index) => first + index);
}
