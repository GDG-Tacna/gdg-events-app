import type { QueueEntry, RundownCue, StoredCue } from "./rundown";

/**
 * What the operator has on the air and what comes next, like a switcher: the PROGRAM (what the audience sees), the
 * NEXT piece (picked, waiting for «Tomar»), the slide inside a deck and whether a video plays. Pure: every operation
 * answers a new state, so the order in which things happen is tested without a screen.
 */
export type DataScene = "ranking" | "poll" | "reveal" | "waiting";

export type Program = { type: "cue"; cueId: string } | { type: "scene"; scene: DataScene };

export interface PlayoutState {
  /** `null` until the operator takes something: the screen shows whatever it showed before. */
  program: Program | null;
  /** The piece waiting to be taken, or `null` at the end of the order. */
  next: string | null;
  /** The slide on screen, from 1 (only meaningful for a deck). */
  slide: number;
  /** Whether a video is playing. */
  playing: boolean;
  /** Whether the video on the air starts again when it ends. It is off for every piece that is taken. */
  loop: boolean;
  /** The sound of the screen, from 0 to 1, and whether it is muted. They stay when the piece changes. */
  volume: number;
  muted: boolean;
}

export const INITIAL_PLAYOUT: PlayoutState = { program: null, next: null, slide: 1, playing: false, loop: false, volume: 1, muted: false };

const indexOfCue = (queue: readonly QueueEntry[], cueId: string | null) => (cueId === null ? -1 : queue.findIndex((entry) => entry.cue.id === cueId));

/** The piece after `cueId` in the order, or `null` at the end. */
export function followingOf(queue: readonly QueueEntry[], cueId: string): string | null {
  const index = indexOfCue(queue, cueId);
  return index < 0 ? null : (queue[index + 1]?.cue.id ?? null);
}

export function cueOf(queue: readonly QueueEntry[], cueId: string | null): RundownCue | null {
  const index = indexOfCue(queue, cueId);
  return index < 0 ? null : queue[index].cue;
}

/** The piece on the program when it is something the projector's window shows by itself (a file or a Google Slides deck), or `null` (a data scene or the QR). */
export function mediaOnProgram(state: PlayoutState, queue: readonly QueueEntry[]): StoredCue | null {
  if (state.program?.type !== "cue") return null;
  const cue = cueOf(queue, state.program.cueId);
  return cue && cue.kind !== "qr" ? cue : null;
}

/** Starts a fresh state for an order: the first piece is the one waiting. */
export function startOf(queue: readonly QueueEntry[]): PlayoutState {
  return { ...INITIAL_PLAYOUT, next: queue[0]?.cue.id ?? null };
}

/** Picks the piece that will be taken next. An id that is not in the order changes nothing. */
export function selectNext(state: PlayoutState, queue: readonly QueueEntry[], cueId: string): PlayoutState {
  return indexOfCue(queue, cueId) < 0 ? state : { ...state, next: cueId };
}

/** «Tomar»: the waiting piece goes on the air from its start, and the one after it waits. Nothing waiting, nothing happens. */
export function take(state: PlayoutState, queue: readonly QueueEntry[]): PlayoutState {
  const taken = state.next;
  if (taken === null || indexOfCue(queue, taken) < 0) return state;
  const cue = cueOf(queue, taken);
  return { ...state, program: { type: "cue", cueId: taken }, next: followingOf(queue, taken), slide: 1, playing: cue?.kind === "video", loop: false };
}

/** A data scene (the ranking, a poll, the winners, the waiting screen) goes on the air; what was waiting keeps waiting. */
export function showScene(state: PlayoutState, scene: DataScene): PlayoutState {
  return { ...state, program: { type: "scene", scene }, playing: false };
}

/** «Detener»: the waiting screen. */
export const stop = (state: PlayoutState): PlayoutState => showScene(state, "waiting");

/** Plays or pauses a video; for anything else it changes nothing. */
export function togglePlay(state: PlayoutState, queue: readonly QueueEntry[]): PlayoutState {
  return mediaOnProgram(state, queue)?.kind === "video" ? { ...state, playing: !state.playing } : state;
}

/** Turns the repetition of the video on the air on or off; for anything else it changes nothing. */
export function toggleLoop(state: PlayoutState, queue: readonly QueueEntry[]): PlayoutState {
  return mediaOnProgram(state, queue)?.kind === "video" ? { ...state, loop: !state.loop } : state;
}

/** Sets the volume (kept between 0 and 1, in steps of a hundredth); raising it from silence also lifts the mute. */
export function setVolume(state: PlayoutState, volume: number): PlayoutState {
  if (!Number.isFinite(volume)) return state;
  const level = Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100;
  return { ...state, volume: level, muted: level === 0 ? state.muted : false };
}

export const toggleMute = (state: PlayoutState): PlayoutState => ({ ...state, muted: !state.muted });

/**
 * «Siguiente»: inside a deck it moves to the next slide; on the last slide, or on anything else, it takes the waiting
 * piece. `slides` is how many slides the deck on the air has (known once it is read).
 */
export function forward(state: PlayoutState, queue: readonly QueueEntry[], slides: number): PlayoutState {
  const media = mediaOnProgram(state, queue);
  if (media?.kind === "slides" && state.slide < slides) return { ...state, slide: state.slide + 1 };
  return take(state, queue);
}

/** «Atrás»: inside a deck, the slide before; anywhere else it changes nothing. */
export function back(state: PlayoutState, queue: readonly QueueEntry[]): PlayoutState {
  const media = mediaOnProgram(state, queue);
  return media?.kind === "slides" && state.slide > 1 ? { ...state, slide: state.slide - 1 } : state;
}

/** A slide picked from the strip, within the deck. */
export function goToSlide(state: PlayoutState, queue: readonly QueueEntry[], slide: number, slides: number): PlayoutState {
  if (mediaOnProgram(state, queue)?.kind !== "slides" || !Number.isInteger(slide)) return state;
  return { ...state, slide: Math.min(Math.max(1, slide), Math.max(1, slides)) };
}

/** Takes a piece off the order (it was removed): if it was on the air or waiting, the state lets go of it. */
export function forget(state: PlayoutState, queue: readonly QueueEntry[], cueId: string): PlayoutState {
  const onAir = state.program?.type === "cue" && state.program.cueId === cueId;
  return {
    ...state,
    program: onAir ? { type: "scene", scene: "waiting" } : state.program,
    next: state.next === cueId ? followingOf(queue, cueId) : state.next,
    playing: onAir ? false : state.playing,
  };
}
