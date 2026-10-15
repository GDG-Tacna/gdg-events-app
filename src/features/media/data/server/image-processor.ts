import "server-only";
import { logServerError } from "@/shared/lib/log";
import { err, ok } from "@/shared/lib/result";
import type { ImageProcessor } from "../../domain/image";

/** Larger images are refused before decoding: a small file can declare a huge canvas (a "decompression bomb"). */
const MAX_PIXELS = 40_000_000;
const WEBP_QUALITY = 82;

/** A reference that stays inside the document (`#id`) or an embedded raster; anything else could load from outside. */
const SAFE_REF = /^(?:#|data:image\/(?:png|jpeg|webp);base64,)/i;
/** CSS that could load something from outside the image. */
const UNSAFE_CSS = /@import|url\(\s*['"]?(?!#)/i;

/**
 * sharp re-encodes rasters (rotated by their EXIF orientation, shrunk to fit, WebP, no metadata). SVG goes through
 * DOMPurify's SVG profile on a server-side DOM: no scripts, no event handlers, no foreignObject, and no reference or
 * CSS that would load anything from outside the file.
 */
export const imageProcessor: ImageProcessor = {
  async raster(bytes, maxSide) {
    try {
      const { default: sharp } = await import("sharp");
      const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" })
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return ok({ bytes: new Uint8Array(data), width: info.width, height: info.height });
    } catch (cause) {
      logServerError("media.raster", cause);
      return err({ code: "unreadable" as const });
    }
  },

  async svg(bytes) {
    try {
      const [{ JSDOM }, { default: createDOMPurify }] = await Promise.all([import("jsdom"), import("dompurify")]);
      const { window } = new JSDOM("");
      const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
      purify.addHook("uponSanitizeElement", (node, data) => {
        if (data.tagName === "style" && UNSAFE_CSS.test(node.textContent ?? "")) node.textContent = "";
      });
      purify.addHook("afterSanitizeAttributes", (node) => {
        for (const name of ["href", "xlink:href"]) {
          const value = node.getAttribute(name);
          if (value !== null && !SAFE_REF.test(value.trim())) node.removeAttribute(name);
        }
        const style = node.getAttribute("style");
        if (style !== null && UNSAFE_CSS.test(style)) node.removeAttribute("style");
      });
      const text = new TextDecoder("utf-8").decode(bytes);
      const clean = purify.sanitize(text, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ["use"],
        FORBID_TAGS: ["foreignObject", "script", "iframe", "a"],
        WHOLE_DOCUMENT: false,
      });
      const root = new window.DOMParser().parseFromString(clean, "image/svg+xml").documentElement;
      if (root.nodeName.toLowerCase() !== "svg" || root.getElementsByTagName("parsererror").length > 0) return err({ code: "unsafe-svg" as const });
      if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const size = svgSize(root);
      const out = new window.XMLSerializer().serializeToString(root);
      return ok({ bytes: new TextEncoder().encode(out), width: size.width, height: size.height });
    } catch (cause) {
      logServerError("media.svg", cause);
      return err({ code: "unreadable" as const });
    }
  },
};

/** The drawing's size, from its viewBox or its width and height (null when it has neither). */
function svgSize(root: Element): { width: number | null; height: number | null } {
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) return { width: Math.round(box[2]), height: Math.round(box[3]) };
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : { width: null, height: null };
}
