import { MEDIA_KINDS, isMediaPath, type MediaKind } from "./rundown";

/**
 * What the console and the projector's window say to each other. They run in the same browser on the same computer
 * (that is where the files are), so they talk over a `BroadcastChannel`: instant and free, nothing goes through the
 * server. A message is checked on arrival like any input.
 */
export interface ProgramCue {
  id: string;
  kind: MediaKind;
  name: string;
  path: string;
}

export type ConsoleMessage =
  /** What is on the air now (a file) or `null` for anything else (the screen goes back to its own scenes). */
  | { type: "program"; cue: ProgramCue | null; slide: number; playing: boolean; file?: File }
  /** The slide and play state changed for the same piece. */
  | { type: "transport"; slide: number; playing: boolean }
  /** Asks the projector's window to say it is there and what it shows. */
  | { type: "ping" };

export type FailureReason = "missing" | "denied" | "unreadable" | "unsupported";

export type StageMessage =
  /** The projector's window is open; repeated every few seconds. */
  | { type: "alive"; showing: string | null }
  /** The piece is ready; a deck says how many slides it has. */
  | { type: "loaded"; cueId: string; slides: number | null }
  | { type: "failed"; cueId: string; reason: FailureReason };

export type ChannelMessage = ConsoleMessage | StageMessage;

const REASONS: readonly FailureReason[] = ["missing", "denied", "unreadable", "unsupported"];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isSlide = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5000;
const isCueId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 60;

function parseProgramCue(value: unknown): ProgramCue | null {
  if (!isRecord(value) || !isCueId(value.id) || typeof value.name !== "string" || value.name.length > 120) return null;
  if (!(MEDIA_KINDS as readonly unknown[]).includes(value.kind) || !isMediaPath(value.path)) return null;
  return { id: value.id, kind: value.kind as MediaKind, name: value.name, path: value.path };
}

/** A message from the other window, or `null` when it is not one of ours. */
export function parseChannelMessage(data: unknown): ChannelMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "program": {
      const cue = data.cue === null ? null : parseProgramCue(data.cue);
      if ((data.cue !== null && cue === null) || !isSlide(data.slide) || typeof data.playing !== "boolean") return null;
      const file = typeof File !== "undefined" && data.file instanceof File ? data.file : undefined;
      return { type: "program", cue, slide: data.slide, playing: data.playing, ...(file ? { file } : {}) };
    }
    case "transport":
      return isSlide(data.slide) && typeof data.playing === "boolean" ? { type: "transport", slide: data.slide, playing: data.playing } : null;
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
