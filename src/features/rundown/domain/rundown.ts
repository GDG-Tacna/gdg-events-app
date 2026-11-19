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

/**
 * A presentation of Google Slides, shown on the screen through Google's own embed. It has no file: it keeps the
 * presentation's id (and whether it was published to the web). The slides are passed in the projector's window, because
 * the console cannot reach inside Google's page; for full control from the console, export the deck to PDF and add that.
 */
export interface GoogleSlidesCue {
  id: string;
  kind: "gslides";
  name: string;
  deckId: string;
  /** True for a deck published to the web (its link is `/d/e/...`); false for one shared by link. */
  published: boolean;
}

/** A piece of the order that is saved: a file or a Google Slides link. */
export type StoredCue = MediaCue | GoogleSlidesCue;

/** The talk's attendance QR as a piece: it is made on the spot, so it has no file. */
export interface QrCue {
  id: string;
  kind: "qr";
  name: string;
}

export type RundownCue = StoredCue | QrCue;

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

const GOOGLE_SLIDES_LINK = /^https:\/\/docs\.google\.com\/presentation\/d\/(e\/)?([A-Za-z0-9_-]{15,200})(?:[/?#].*)?$/;
const DECK_ID = /^[A-Za-z0-9_-]{15,200}$/;

/** The presentation a Google Slides link points to (any of its forms: edit, view, preview, publish), or `null`. */
export function parseGoogleSlidesLink(text: unknown): { deckId: string; published: boolean } | null {
  if (typeof text !== "string") return null;
  const match = GOOGLE_SLIDES_LINK.exec(text.trim());
  return match ? { deckId: match[2], published: match[1] !== undefined } : null;
}

export const GOOGLE_SLIDES_DEFAULT_NAME = "Presentación de Google Slides";

/** A new Google Slides piece from the link the admin pasted; `null` when it is not a Google Slides link. */
export function googleSlidesCueFromLink(link: string, id: string, name?: string): GoogleSlidesCue | null {
  const deck = parseGoogleSlidesLink(link);
  const trimmed = (name ?? "").trim().slice(0, NAME_MAX);
  if (!deck || !CUE_ID.test(id)) return null;
  return { id, kind: "gslides", name: trimmed || GOOGLE_SLIDES_DEFAULT_NAME, ...deck };
}

/**
 * The address Google serves a presentation to be embedded in a page. A deck published to the web has its embed (clean,
 * no toolbar); one only shared by link has the preview. Either way the viewer needs permission to see it.
 */
export function googleSlidesEmbedUrl(cue: Pick<GoogleSlidesCue, "deckId" | "published">): string {
  return cue.published
    ? `https://docs.google.com/presentation/d/e/${cue.deckId}/embed?start=false&loop=false&delayms=3000&rm=minimal`
    : `https://docs.google.com/presentation/d/${cue.deckId}/preview`;
}

/** The address that downloads the deck as a PDF (for full control from the console): the person must be able to open it. */
export const googleSlidesPdfUrl = (cue: Pick<GoogleSlidesCue, "deckId" | "published">): string =>
  cue.published ? `https://docs.google.com/presentation/d/e/${cue.deckId}/pub` : `https://docs.google.com/presentation/d/${cue.deckId}/export/pdf`;

/** A piece from stored or submitted data, or `null` when any field breaks the rules. */
export function parseCue(input: unknown): StoredCue | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.id !== "string" || !CUE_ID.test(data.id)) return null;
  if (data.kind === "gslides") {
    if (typeof data.deckId !== "string" || !DECK_ID.test(data.deckId) || typeof data.published !== "boolean" || typeof data.name !== "string") return null;
    const label = data.name.trim();
    if (label.length === 0 || label.length > NAME_MAX) return null;
    return { id: data.id, kind: "gslides", name: label, deckId: data.deckId, published: data.published };
  }
  if (!isMediaPath(data.path) || typeof data.name !== "string") return null;
  const name = data.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  // The kind is what the file is: a PDF cannot be called a video.
  const kind = kindOfPath(data.path);
  if (kind === null || data.kind !== kind) return null;
  return { id: data.id, kind, name, path: data.path };
}

/** A list of pieces, or `null` when it is too long, repeats an id or holds anything invalid. */
export function parseCues(input: unknown): StoredCue[] | null {
  if (!Array.isArray(input) || input.length > CUES_PER_ITEM_MAX) return null;
  const cues: StoredCue[] = [];
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

/** Whether a piece is a file of the connected folder (a video, a deck of slides or a picture). */
export const isFileCue = (cue: RundownCue): cue is MediaCue => cue.kind !== "qr" && cue.kind !== "gslides";

/** The id of a talk's QR piece: one per point of the agenda, never stored. */
export const qrCueId = (itemId: string) => `${itemId}:qr`;

/**
 * The order for the console: every point of the agenda in its order, with its stored pieces and, last, its QR. Breaks
 * have a QR piece too (the console shows it only for the points that can check people in).
 */
export function buildRundown(agenda: readonly AgendaPoint[], stored: Readonly<Record<string, readonly StoredCue[]>>, withQr: ReadonlySet<string> = new Set(agenda.map((point) => point.id))): RundownItem[] {
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
