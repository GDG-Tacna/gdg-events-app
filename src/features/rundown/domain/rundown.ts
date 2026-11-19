/**
 * The running order of the event: each point of the agenda (a talk) with the files that go on the big screen while it
 * happens, in order. A file is never stored here: a piece only keeps its path inside the folder the operator connects
 * on their own computer, so the files are read from that device and nothing is uploaded.
 */
export const MEDIA_KINDS = ["video", "slides", "image"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** The file extensions each kind of piece accepts. A PowerPoint has to be exported to PDF first: the browser cannot show it. */
export const MEDIA_EXTENSIONS: Readonly<Record<MediaKind, readonly string[]>> = {
  video: ["mp4", "webm", "m4v"],
  slides: ["pdf"],
  image: ["png", "jpg", "jpeg", "webp", "gif"],
};

export const PATH_MAX = 200;
export const NAME_MAX = 80;
export const CUES_PER_ITEM_MAX = 30;

/** A piece of the order that is a file: a video, a deck of slides (a PDF) or a picture. */
export interface MediaCue {
  id: string;
  kind: MediaKind;
  name: string;
  /** Relative to the connected folder, with forward slashes: `genkit/agente-genkit.pdf`. */
  path: string;
}

/** The talk's attendance QR as a piece: it is made on the spot, so it has no file. */
export interface QrCue {
  id: string;
  kind: "qr";
  name: string;
}

export type RundownCue = MediaCue | QrCue;

/** One point of the agenda with its pieces in order. */
export interface RundownItem {
  id: string;
  /** The start time as the venue's clock shows it (`09:15`), or an empty text. */
  time: string;
  title: string;
  who: string;
  cues: readonly RundownCue[];
}

/** What the agenda gives for each point; the pieces come from the stored order. */
export interface AgendaPoint {
  id: string;
  time: string;
  title: string;
  who: string;
}

const CUE_ID = /^[A-Za-z0-9_-]{4,40}$/;
const FORBIDDEN_IN_PATH = /[\u0000-\u001f\\:*?"<>|]/;

const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** The kind of piece a file makes by its extension, or `null` when the browser cannot show it. */
export function kindOfPath(path: string): MediaKind | null {
  const extension = extensionOf(path);
  return MEDIA_KINDS.find((kind) => MEDIA_EXTENSIONS[kind].includes(extension)) ?? null;
}

/**
 * Whether a text is a path the console may read: relative to the connected folder, with forward slashes, no `..`, no
 * drive or absolute start, and a file that can be shown. A path comes from the admin's request, so it is checked here
 * and again where it is read.
 */
export function isMediaPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > PATH_MAX) return false;
  if (FORBIDDEN_IN_PATH.test(value) || value.startsWith("/") || value.endsWith("/")) return false;
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return kindOfPath(value) !== null;
}

/** The name a file gives its piece: the file's name without the extension, with dashes and underscores as spaces. */
export function nameFromPath(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  const base = (dot > 0 ? file.slice(0, dot) : file).replace(/[-_]+/g, " ").trim();
  return (base || file).slice(0, NAME_MAX);
}

/** A new piece from a path, named after its file; `null` when the path cannot be shown. */
export function cueFromPath(path: string, id: string): MediaCue | null {
  const kind = isMediaPath(path) ? kindOfPath(path) : null;
  if (!kind || !CUE_ID.test(id)) return null;
  return { id, kind, name: nameFromPath(path), path };
}

/** A piece from stored or submitted data, or `null` when any field breaks the rules. */
export function parseCue(input: unknown): MediaCue | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.id !== "string" || !CUE_ID.test(data.id)) return null;
  if (!isMediaPath(data.path) || typeof data.name !== "string") return null;
  const name = data.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  // The kind is what the file is: a PDF cannot be called a video.
  const kind = kindOfPath(data.path);
  if (kind === null || data.kind !== kind) return null;
  return { id: data.id, kind, name, path: data.path };
}

/** A list of pieces, or `null` when it is too long, repeats an id or holds anything invalid. */
export function parseCues(input: unknown): MediaCue[] | null {
  if (!Array.isArray(input) || input.length > CUES_PER_ITEM_MAX) return null;
  const cues: MediaCue[] = [];
  for (const entry of input) {
    const cue = parseCue(entry);
    if (!cue || cues.some((other) => other.id === cue.id)) return null;
    cues.push(cue);
  }
  return cues;
}

/** The same list with a piece moved up (`-1`) or down (`1`); unchanged at the ends or for an unknown id. */
export function moveCue<T extends { id: string }>(cues: readonly T[], id: string, delta: -1 | 1): T[] {
  const from = cues.findIndex((cue) => cue.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= cues.length) return [...cues];
  const moved = [...cues];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return moved;
}

/** The id of a talk's QR piece: one per point of the agenda, never stored. */
export const qrCueId = (itemId: string) => `${itemId}:qr`;

/**
 * The order for the console: every point of the agenda in its order, with its stored pieces and, last, its QR. Breaks
 * have a QR piece too (the console shows it only for the points that can check people in).
 */
export function buildRundown(agenda: readonly AgendaPoint[], stored: Readonly<Record<string, readonly MediaCue[]>>, withQr: ReadonlySet<string> = new Set(agenda.map((point) => point.id))): RundownItem[] {
  return agenda.map((point) => ({
    ...point,
    cues: [...(stored[point.id] ?? []), ...(withQr.has(point.id) ? [{ id: qrCueId(point.id), kind: "qr" as const, name: "QR de la charla" }] : [])],
  }));
}

/** One piece of the order in the sequence the operator walks, with the point it belongs to. */
export interface QueueEntry {
  itemId: string;
  cue: RundownCue;
}

/** Every piece of the order, flat, in the order it will be taken. */
export const queueOf = (items: readonly RundownItem[]): QueueEntry[] => items.flatMap((item) => item.cues.map((cue) => ({ itemId: item.id, cue })));
