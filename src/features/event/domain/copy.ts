import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionCatalog, EditionsActor, EditionsAuditEntry } from "./editions";

/**
 * Copying an edition's content into another one, so a new event starts from the last one instead of from zero. Only
 * what an admin prepares is copied (catalogs and settings), never what happened during the event: cadets, scans,
 * results, the team, invitations, the raffle. A closed set of parts, each copied only into an edition that has
 * nothing of that part yet, so nothing is ever overwritten or mixed.
 */
export const COPY_PARTS = ["squads", "map", "checkpoints", "talks", "missions", "story", "achievements", "ranks", "economy", "minigames", "squadPrizes"] as const;
export type CopyPart = (typeof COPY_PARTS)[number];

export const isCopyPart = (value: unknown): value is CopyPart => typeof value === "string" && (COPY_PARTS as readonly string[]).includes(value);

/** What a part points at by id: copying it without them would leave broken references. */
export const COPY_NEEDS: Readonly<Record<CopyPart, readonly CopyPart[]>> = {
  squads: [],
  map: [],
  checkpoints: [],
  talks: [],
  missions: ["map", "checkpoints", "talks"],
  story: ["missions"],
  achievements: ["missions", "squads"],
  ranks: [],
  economy: [],
  minigames: [],
  squadPrizes: [],
};

/** The parts asked for plus everything they need, in the canonical order. */
export function withNeeds(parts: readonly CopyPart[]): CopyPart[] {
  const chosen = new Set<CopyPart>();
  const add = (part: CopyPart) => {
    if (chosen.has(part)) return;
    chosen.add(part);
    COPY_NEEDS[part].forEach(add);
  };
  parts.forEach(add);
  return COPY_PARTS.filter((part) => chosen.has(part));
}

/** One stored document of a part, by its path inside the edition (`missions/ai-quiz`, `config/ranks`). */
export interface EditionDocument {
  path: string;
  data: Record<string, unknown>;
}

export interface EditionCopier {
  /** Whether the edition has nothing of that part yet. */
  isEmpty(eventId: string, part: CopyPart): Promise<Result<boolean, { code: string }>>;
  read(eventId: string, part: CopyPart): Promise<Result<readonly EditionDocument[], { code: string }>>;
  /** Creates them all (never overwriting), in batches. */
  write(eventId: string, documents: readonly EditionDocument[], copiedFrom: string): Promise<Result<void, { code: string }>>;
}

export type CopyErrorCode = "invalid-parts" | "same-edition" | "not-found" | "not-empty" | "forbidden" | "unauthenticated" | "disabled" | "unknown";

export interface CopyError {
  code: CopyErrorCode;
  /** For `not-empty`: the parts that already have data in the destination. */
  parts?: readonly CopyPart[];
}

export interface CopyDeps {
  catalog: Pick<EditionCatalog, "list" | "publicId">;
  copier: EditionCopier;
  /** Copies an image into the destination's folder; `null` when it no longer exists. */
  copyImage: (path: string, toEventId: string) => Promise<Result<string | null, { code: string }>>;
  audit: { append(entry: Omit<EditionsAuditEntry, "action"> & { action: "event.copied" }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

const copyError = (code: CopyErrorCode, parts?: readonly CopyPart[]): CopyError => (parts ? { code, parts } : { code });

/**
 * An app image path, `public/{eventId}/{purpose}/{file}` (the media feature's rule). Every one is copied, also one the
 * source inherited from an older edition, so each edition owns its images.
 */
const APP_IMAGE = /^public\/[a-z0-9-]{1,60}\/[a-z-]{1,20}\/[a-zA-Z0-9-]{8,64}\.(webp|svg)$/;

/** Every string of the document that is an app image, wherever it sits (a field, a list). */
function imagePaths(value: unknown, found: Set<string>): Set<string> {
  if (typeof value === "string") {
    if (APP_IMAGE.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => imagePaths(item, found));
  } else if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    Object.values(value).forEach((item) => imagePaths(item, found));
  }
  return found;
}

/** The same document with each image path replaced by its copy (or `null` when the image no longer exists). */
function withImages(value: unknown, copies: ReadonlyMap<string, string | null>): unknown {
  if (typeof value === "string") return copies.has(value) ? copies.get(value) : value;
  if (Array.isArray(value)) return value.map((item) => withImages(item, copies));
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withImages(item, copies)]));
  }
  return value;
}

/**
 * Copies the chosen parts (and what they need) from one edition into another. Only an admin of every edition may do
 * it; every part must still be empty in the destination, or nothing is copied and the answer names the parts in the
 * way. Images are copied into the destination's folder, so the two editions never share one.
 */
export async function copyEditionContent(
  deps: CopyDeps,
  actor: EditionsActor,
  input: { from: string; to: string; parts: readonly unknown[] },
): Promise<Result<{ parts: readonly CopyPart[]; documents: number }, CopyError>> {
  if (actor.role !== "admin" || actor.adminScope !== "global") return err(copyError("forbidden"));
  if (input.parts.length === 0 || !input.parts.every(isCopyPart)) return err(copyError("invalid-parts"));
  if (input.from === input.to) return err(copyError("same-edition"));

  const [listed, publicId] = await Promise.all([deps.catalog.list(), deps.catalog.publicId()]);
  if (!listed.ok || !publicId.ok) return err(copyError("unknown"));
  const known = new Set([...listed.value.map((edition) => edition.id), publicId.value]);
  if (!known.has(input.from) || !known.has(input.to)) return err(copyError("not-found"));

  const parts = withNeeds(input.parts as CopyPart[]);
  const empty = await Promise.all(parts.map((part) => deps.copier.isEmpty(input.to, part)));
  if (empty.some((answer) => !answer.ok)) return err(copyError("unknown"));
  const taken = parts.filter((_, index) => empty[index].ok && !(empty[index] as { value: boolean }).value);
  if (taken.length > 0) return err(copyError("not-empty", taken));

  const read = await Promise.all(parts.map((part) => deps.copier.read(input.from, part)));
  if (read.some((answer) => !answer.ok)) return err(copyError("unknown"));
  const documents = read.flatMap((answer) => (answer.ok ? answer.value : []));

  const paths = new Set<string>();
  documents.forEach((document) => imagePaths(document.data, paths));
  const copies = new Map<string, string | null>();
  for (const path of paths) {
    const copied = await deps.copyImage(path, input.to);
    if (!copied.ok) return err(copyError("unknown"));
    copies.set(path, copied.value);
  }

  const rewritten = documents.map((document) => ({ path: document.path, data: withImages(document.data, copies) as Record<string, unknown> }));
  const written = await deps.copier.write(input.to, rewritten, input.from);
  if (!written.ok) return err(copyError("unknown"));

  const audited = await deps.audit.append({
    action: "event.copied",
    actorUid: actor.uid,
    targetUid: input.to,
    details: { from: input.from, parts: parts.join(","), documents: String(rewritten.length), images: String(copies.size) },
    at: deps.now(),
  });
  if (!audited.ok) logServerError("event.audit.append", new Error(`audit entry missing for a copy into ${input.to}`));
  return ok({ parts, documents: rewritten.length });
}
