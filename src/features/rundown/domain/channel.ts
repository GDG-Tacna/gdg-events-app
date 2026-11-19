import { MEDIA_KINDS, isMediaPath, parseCue, type StoredCue } from "./rundown";

/**
 * What the console and the projector's window say to each other. They run in the same browser on the same computer
 * (that is where the files are), so they talk over a `BroadcastChannel`: instant and free, nothing goes through the
 * server. A message is checked on arrival like any input.
 */
export type ProgramCue = StoredCue;

export type ConsoleMessage =
  /** What is on the air now (a file) or `null` for anything else (the screen goes back to its own scenes). */
  | { type: "program"; cue: ProgramCue | null; slide: number; playing: boolean; loop?: boolean; volume?: number; muted?: boolean; file?: File }
  /** The slide, play state, repetition or sound changed for the same piece. */
  | { type: "transport"; slide: number; playing: boolean; loop?: boolean; volume?: number; muted?: boolean }
  /** Jumps the video on the air to a second. */
  | { type: "seek"; seconds: number }
  /** Asks the projector's window to say it is there and what it shows. */
  | { type: "ping" };

export type FailureReason = "missing" | "denied" | "unreadable" | "unsupported";

export type StageMessage =
  /** The projector's window is open; repeated every few seconds. */
  | { type: "alive"; showing: string | null }
  /** The piece is ready; a deck says how many slides it has. */
  | { type: "loaded"; cueId: string; slides: number | null }
  | { type: "failed"; cueId: string; reason: FailureReason }
  /** Where the video on the air is, in seconds, and how long it is; a few times a second while it plays. */
  | { type: "progress"; cueId: string; time: number; duration: number };

export type ChannelMessage = ConsoleMessage | StageMessage;

const REASONS: readonly FailureReason[] = ["missing", "denied", "unreadable", "unsupported"];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isSlide = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5000;
const isCueId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 60;

const isSeconds = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400;

/** The optional sound and repetition fields of a message, or `null` when one of them is present but wrong. */
function parseSound(data: Record<string, unknown>): { loop?: boolean; volume?: number; muted?: boolean } | null {
  const sound: { loop?: boolean; volume?: number; muted?: boolean } = {};
  if (data.loop !== undefined) {
    if (typeof data.loop !== "boolean") return null;
    sound.loop = data.loop;
  }
  if (data.muted !== undefined) {
    if (typeof data.muted !== "boolean") return null;
    sound.muted = data.muted;
  }
  if (data.volume !== undefined) {
    if (typeof data.volume !== "number" || !(data.volume >= 0 && data.volume <= 1)) return null;
    sound.volume = data.volume;
  }
  return sound;
}

/** A piece on the air: checked like one read from the store (a file's path stays inside the folder). */
function parseProgramCue(value: unknown): ProgramCue | null {
  if (!isRecord(value) || !isCueId(value.id)) return null;
  const known = value.kind === "gslides" || (MEDIA_KINDS as readonly unknown[]).includes(value.kind);
  if (!known || (value.kind !== "gslides" && !isMediaPath(value.path))) return null;
  return parseCue(value);
}

/** A message from the other window, or `null` when it is not one of ours. */
export function parseChannelMessage(data: unknown): ChannelMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "program": {
      const cue = data.cue === null ? null : parseProgramCue(data.cue);
      if ((data.cue !== null && cue === null) || !isSlide(data.slide) || typeof data.playing !== "boolean") return null;
      const sound = parseSound(data);
      if (!sound) return null;
      const file = typeof File !== "undefined" && data.file instanceof File ? data.file : undefined;
      return { type: "program", cue, slide: data.slide, playing: data.playing, ...sound, ...(file ? { file } : {}) };
    }
    case "transport": {
      const sound = parseSound(data);
      return sound && isSlide(data.slide) && typeof data.playing === "boolean" ? { type: "transport", slide: data.slide, playing: data.playing, ...sound } : null;
    }
    case "seek":
      return isSeconds(data.seconds) ? { type: "seek", seconds: data.seconds } : null;
    case "progress":
      return isCueId(data.cueId) && isSeconds(data.time) && isSeconds(data.duration) ? { type: "progress", cueId: data.cueId, time: data.time, duration: data.duration } : null;
    case "ping":
      return { type: "ping" };
    case "alive":
      return data.showing === null || isCueId(data.showing) ? { type: "alive", showing: data.showing as string | null } : null;
    case "loaded":
      return isCueId(data.cueId) && (data.slides === null || isSlide(data.slides)) ? { type: "loaded", cueId: data.cueId, slides: data.slides as number | null } : null;
    case "failed":
      return isCueId(data.cueId) && (REASONS as readonly unknown[]).includes(data.reason) ? { type: "failed", cueId: data.cueId, reason: data.reason as FailureReason } : null;
    default:
      return null;
  }
}
