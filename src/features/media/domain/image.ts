import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/** What an image is for. A closed set: each one has its rules and its own folder. */
export const IMAGE_PURPOSES = ["badge", "raffle-prize", "squad-prize", "squad-logo", "rank", "mission", "venue-plan"] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

export type ImageFormat = "jpeg" | "png" | "webp" | "svg";

const MB = 1024 * 1024;

/** The rules of each kind of image: accepted formats, the largest upload, and the longest side once stored. */
export const IMAGE_RULES = {
  picture: { formats: ["jpeg", "png", "webp"], maxBytes: 2 * MB, maxSide: 1024 },
  logo: { formats: ["jpeg", "png", "webp", "svg"], maxBytes: 2 * MB, maxSide: 512 },
  // 4 MB keeps a plan's upload under the 4.5 MB request limit of serverless hosts such as Vercel.
  plan: { formats: ["jpeg", "png", "webp", "svg"], maxBytes: 4 * MB, maxSide: 2400 },
} as const satisfies Record<string, { formats: readonly ImageFormat[]; maxBytes: number; maxSide: number }>;
export type ImageRule = keyof typeof IMAGE_RULES;

export const RULE_OF: Record<ImagePurpose, ImageRule> = {
  badge: "picture",
  "raffle-prize": "picture",
  "squad-prize": "picture",
  rank: "picture",
  mission: "picture",
  "squad-logo": "logo",
  "venue-plan": "plan",
};

/** The largest upload any purpose accepts, for the request body limit. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(IMAGE_RULES).map((rule) => rule.maxBytes));

/** An image the app keeps: where it lives in storage, the address it is shown from, and its size. */
export interface StoredImage {
  path: string;
  url: string;
  width: number | null;
  height: number | null;
  format: "webp" | "svg";
}

/** Only these paths belong to the app's images; anything else is refused before it reaches the store. */
export const IMAGE_PATH = /^public\/[a-z0-9-]{1,60}\/[a-z-]{1,20}\/[a-zA-Z0-9-]{8,64}\.(webp|svg)$/;

/** What a record keeps of its image: where it is stored and the address it is shown from (rebuilt by the server). */
export interface ImageRef {
  path: string;
  url: string;
}

/** Whether a path is an app image uploaded for that purpose (a record never points at another kind's image). */
export const isImagePathOf = (path: string, purpose: ImagePurpose): boolean => IMAGE_PATH.test(path) && path.split("/")[2] === purpose;

/** What a record's use cases need from the media feature (injected, so their domain stays free of Storage). */
export interface RecordImages {
  /** The reference to save for a path a form sent, or null when it is not an image of that purpose. */
  ref(path: string, purpose: ImagePurpose): ImageRef | null;
  /** Deletes an image no record uses any more (failures are logged, never shown). */
  remove(path: string): Promise<void>;
}

/** What a form asked for its record's image: keep it, or set a new one (null removes it). */
export type ImageChoice = { keep: true } | { keep: false; image: ImageRef | null };

/**
 * Reads the image a form sent: `undefined` keeps the current one, `null` removes it, and a path must be an upload of
 * that purpose. Null for anything else.
 */
export function chooseImage(images: Pick<RecordImages, "ref">, purpose: ImagePurpose, sent: unknown): ImageChoice | null {
  if (sent === undefined) return { keep: true };
  if (sent === null) return { keep: false, image: null };
  if (typeof sent !== "string") return null;
  const image = images.ref(sent, purpose);
  return image ? { keep: false, image } : null;
}

/** After a record is saved, deletes the image it no longer points at. */
export async function dropReplacedImage(images: Pick<RecordImages, "remove">, before: ImageRef | null, after: ImageRef | null): Promise<void> {
  if (before && before.path !== after?.path) await images.remove(before.path);
}

const SVG_START = /^(?:﻿)?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

/** The real format of a file, from its first bytes (never from its name or the type the browser sends). */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => at(index) === value)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 2048));
  if (SVG_START.test(head)) return "svg";
  return null;
}

export type MediaErrorCode = "forbidden" | "empty" | "too-large" | "unsupported-format" | "unreadable" | "unsafe-svg" | "unknown";

export interface MediaActor {
  uid: string;
  role: string;
}

/** Turns an upload into what is stored: rasters re-encoded as WebP without metadata, SVG cleaned of anything active. */
export interface ImageProcessor {
  raster(bytes: Uint8Array, maxSide: number): Promise<Result<{ bytes: Uint8Array; width: number; height: number }, { code: "unreadable" }>>;
  svg(bytes: Uint8Array): Promise<Result<{ bytes: Uint8Array; width: number | null; height: number | null }, { code: "unreadable" | "unsafe-svg" }>>;
}

/** Where images live. Only the server writes; anyone reads what is under `public/`. */
export interface ImageStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<Result<{ url: string }, { code: string }>>;
  /** The stored bytes and their type, or null when there is no such image. */
  get(path: string): Promise<Result<{ bytes: Uint8Array; contentType: string } | null, { code: string }>>;
  remove(path: string): Promise<Result<void, { code: string }>>;
}

/** An app image to serve, or null for a path that is not one (or does not exist). Anyone may read app images. */
export async function readImage(deps: Pick<MediaDeps, "store">, path: string): Promise<Result<{ bytes: Uint8Array; contentType: string } | null, { code: string }>> {
  if (!IMAGE_PATH.test(path)) return ok(null);
  return deps.store.get(path);
}

/**
 * Copies an app image into another edition's folder under a new name (copying an edition's content), so the copy
 * keeps its picture even if the original is replaced or deleted later. `null` when the path is not an app image or
 * the image no longer exists.
 */
export async function copyImage(
  deps: { store: ImageStore; newId: () => string },
  path: string,
  toEventId: string,
): Promise<Result<string | null, { code: string }>> {
  if (!IMAGE_PATH.test(path)) return ok(null);
  const found = await deps.store.get(path);
  if (!found.ok) return found;
  if (!found.value) return ok(null);
  const [, , purpose, file] = path.split("/");
  const extension = file.slice(file.lastIndexOf(".") + 1);
  const copy = `public/${toEventId}/${purpose}/${deps.newId()}.${extension}`;
  if (!IMAGE_PATH.test(copy)) return ok(null);
  const put = await deps.store.put(copy, found.value.bytes, found.value.contentType);
  return put.ok ? ok(copy) : put;
}

export type MediaAuditAction = "image.uploaded";

export interface MediaDeps {
  processor: ImageProcessor;
  store: ImageStore;
  /** The edition the images belong to (their folder). */
  eventId: () => Promise<string>;
  newId: () => string;
  audit: { append(entry: { action: MediaAuditAction; actorUid: string; targetUid: string; details: Record<string, string | null>; at: Date }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

const fail = (code: MediaErrorCode) => err({ code });

/**
 * Checks an upload against the rules of its purpose and stores it. The format is read from the bytes; a raster is
 * re-encoded as WebP no larger than its rule allows (which also drops EXIF, such as a photo's GPS position), and an
 * SVG is cleaned of scripts, event handlers and external references. Each upload gets a new name, so a replaced
 * image is never served from an old cache.
 */
export async function storeImage(deps: MediaDeps, actor: MediaActor, input: { purpose: ImagePurpose; bytes: Uint8Array }): Promise<Result<StoredImage, { code: MediaErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const rule = IMAGE_RULES[RULE_OF[input.purpose]];
  if (input.bytes.length === 0) return fail("empty");
  if (input.bytes.length > rule.maxBytes) return fail("too-large");

  const format = sniffFormat(input.bytes);
  if (!format || !(rule.formats as readonly ImageFormat[]).includes(format)) return fail("unsupported-format");

  const processed = format === "svg" ? await deps.processor.svg(input.bytes) : await deps.processor.raster(input.bytes, rule.maxSide);
  if (!processed.ok) return fail(processed.error.code);

  const stored: "webp" | "svg" = format === "svg" ? "svg" : "webp";
  const path = `public/${await deps.eventId()}/${input.purpose}/${deps.newId()}.${stored}`;
  if (!IMAGE_PATH.test(path)) return fail("unknown");
  const put = await deps.store.put(path, processed.value.bytes, stored === "svg" ? "image/svg+xml" : "image/webp");
  if (!put.ok) return fail("unknown");

  const written = await deps.audit.append({
    action: "image.uploaded",
    actorUid: actor.uid,
    targetUid: path,
    details: { purpose: input.purpose, format: stored, bytes: String(processed.value.bytes.length) },
    at: deps.now(),
  });
  if (!written.ok) logServerError("media.audit", written.error);

  return ok({ path, url: put.value.url, width: processed.value.width, height: processed.value.height, format: stored });
}

/** Deletes an image the app no longer uses. Paths outside the app's images are ignored. */
export async function removeImage(deps: Pick<MediaDeps, "store">, path: string): Promise<void> {
  if (!IMAGE_PATH.test(path)) return;
  const removed = await deps.store.remove(path);
  if (!removed.ok) logServerError("media.remove", removed.error);
}
