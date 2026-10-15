import { imageReader } from "@/app-shell/composition/media.server";
import { readImage } from "@/features/media/server";

/** Each upload gets a new name, so a served image never changes: browsers and CDNs keep it for good. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Hardening for an image opened directly: nothing in it may run or load (an SVG was cleaned on upload, and is still
 * only ever shown through `<img>` in the app), and the browser must not guess another type.
 */
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/**
 * Serves an uploaded image (`/media/public/{edition}/{purpose}/{name}`). Public like a static file: images hold nothing
 * private, and only paths of app images are read. A miss is a plain 404; a failed read is a 503 that is not cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  const read = await readImage(imageReader, path.join("/"));
  if (!read.ok) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!read.value) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  return new Response(Buffer.from(read.value.bytes), {
    headers: { ...SAFE_HEADERS, "Content-Type": read.value.contentType, "Content-Length": String(read.value.bytes.length), "Cache-Control": CACHE_CONTROL },
  });
}
