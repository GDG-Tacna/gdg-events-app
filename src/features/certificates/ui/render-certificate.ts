import type { CertificateRenderSpec } from "../domain/certificate";
import type { CertificateFieldPlacement, CertificateFontFamily, CertificateFontWeight } from "../domain/template";

export interface CertificateRenderValues {
  recipientName: string;
  verificationCode: string;
  verificationUrl: string;
  issueDateText: string | null;
  eventName: string;
}

/** Computes the string printed for a non-QR field on the certificate. */
export function fieldDisplayText(field: CertificateFieldPlacement, values: CertificateRenderValues): string {
  const prefix = field.prefix ?? "";
  switch (field.kind) {
    case "recipientName":
      return `${prefix}${values.recipientName}`;
    case "verificationUrl":
      return `${prefix}${values.verificationUrl}`;
    case "verificationCode":
      return `${prefix}${values.verificationCode}`;
    case "issueDate":
      return values.issueDateText ? `${prefix}${values.issueDateText}` : "";
    case "eventName":
      return `${prefix}${values.eventName}`;
    case "customText":
      return prefix;
    case "qr":
      return "";
  }
}

export function fontWeightCss(weight: CertificateFontWeight): string {
  switch (weight) {
    case "semibold":
      return "600";
    case "bold":
      return "700";
    default:
      return "400";
  }
}

/** Resolves a font family token to the loaded CSS font family (reusing Google Sans / Google Sans Code from RootLayout). */
export function resolveCssFontFamily(family: CertificateFontFamily): string {
  if (family === "serif") return 'Georgia, "Times New Roman", serif';
  if (typeof window !== "undefined") {
    const computed = getComputedStyle(document.documentElement);
    if (family === "mono") {
      const codeFont = computed.getPropertyValue("--font-google-sans-code").trim();
      return codeFont ? `${codeFont}, ui-monospace, monospace` : "ui-monospace, monospace";
    }
    const sansFont = computed.getPropertyValue("--font-google-sans").trim();
    return sansFont ? `${sansFont}, system-ui, sans-serif` : "system-ui, sans-serif";
  }
  return family === "mono" ? "var(--font-google-sans-code), ui-monospace, monospace" : "var(--font-google-sans), system-ui, sans-serif";
}

/** Shrinks font size smoothly until the measured single-line width fits inside `maxWidthPx` (never clips long names). */
export function fitFontSize(
  measureWidth: (sizePx: number) => number,
  maxWidthPx: number,
  startFontPx: number,
  minFontPx = 10,
): number {
  if (maxWidthPx <= 0) return startFontPx;
  const initialWidth = measureWidth(startFontPx);
  if (initialWidth <= maxWidthPx || initialWidth === 0) return startFontPx;
  // First proportional jump, then refine down if needed for kerning/hinting differences.
  let size = Math.max(minFontPx, Math.floor((startFontPx * maxWidthPx) / initialWidth));
  while (size > minFontPx && measureWidth(size) > maxWidthPx) {
    size -= 1;
  }
  return size;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load certificate template image"));
    img.src = src;
  });
}

/**
 * Renders the certificate onto a full-resolution HTML5 canvas in the browser:
 * background template image (served immutable from `/media/...`) + every enabled text field + scannable QR code.
 */
export async function renderCertificateToCanvas(
  spec: CertificateRenderSpec,
  values: CertificateRenderValues,
): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") throw new Error("Canvas rendering requires a browser");
  if ("fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Fall back gracefully if fonts API rejects.
    }
  }

  const image = await loadImage(spec.backgroundUrl);
  const width = image.naturalWidth || spec.width;
  const height = image.naturalHeight || spec.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(image, 0, 0, width, height);

  for (const field of spec.fields) {
    if (!field.enabled) continue;
    const xPx = (field.x / 100) * width;
    const yPx = (field.y / 100) * height;
    const boxWidthPx = (field.width / 100) * width;

    if (field.kind === "qr") {
      if (!values.verificationUrl) continue;
      const side = Math.max(48, Math.round(boxWidthPx));
      const qrCanvas = document.createElement("canvas");
      const QRCode = await import("qrcode");
      await QRCode.toCanvas(qrCanvas, values.verificationUrl, {
        width: side,
        margin: 1,
        color: { dark: field.color, light: "#ffffff" },
      });
      ctx.drawImage(qrCanvas, xPx, yPx, side, side);
      continue;
    }

    const text = fieldDisplayText(field, values);
    if (!text) continue;

    const baseFontPx = (field.fontSize / 100) * height;
    const fontFamily = resolveCssFontFamily(field.fontFamily);
    const weight = fontWeightCss(field.fontWeight);
    const fittedPx = fitFontSize(
      (sizePx) => {
        ctx.font = `${weight} ${sizePx}px ${fontFamily}`;
        return ctx.measureText(text).width;
      },
      boxWidthPx,
      baseFontPx,
      Math.max(10, Math.round(height * 0.008)),
    );

    ctx.font = `${weight} ${fittedPx}px ${fontFamily}`;
    ctx.fillStyle = field.color;
    ctx.textBaseline = "top";
    ctx.textAlign = field.align;

    const anchorX =
      field.align === "center" ? xPx + boxWidthPx / 2 : field.align === "right" ? xPx + boxWidthPx : xPx;
    ctx.fillText(text, anchorX, yPx);
  }

  return canvas;
}

export interface PdfCertificateMetadata {
  title: string;
  author: string;
  subject: string;
  /** Optional clickable verification URL box in normalized percentages [0..100]. */
  verificationLink?: { url: string; x: number; y: number; width: number; height: number } | null;
}

/**
 * Wraps the rendered certificate JPEG into a crisp, standards-compliant PDF using lazy-loaded `pdf-lib`.
 * Page dimensions match the exact template aspect ratio with the longest side scaled to A4 (841.89 pt).
 */
export async function buildCertificatePdfBytes(input: {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
  meta: PdfCertificateMetadata;
}): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.meta.title);
  pdf.setAuthor(input.meta.author);
  pdf.setSubject(input.meta.subject);
  pdf.setCreator("GDG Tacna Events App");

  const longestPt = 841.89;
  const scale = longestPt / Math.max(input.width, input.height);
  const pageWidth = Math.round(input.width * scale * 100) / 100;
  const pageHeight = Math.round(input.height * scale * 100) / 100;

  const page = pdf.addPage([pageWidth, pageHeight]);
  const embedded = await pdf.embedJpg(input.jpegBytes);
  page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  if (input.meta.verificationLink) {
    const link = input.meta.verificationLink;
    const x1 = (link.x / 100) * pageWidth;
    const x2 = ((link.x + link.width) / 100) * pageWidth;
    // PDF origin is bottom-left; template coordinates are top-left.
    const yTop = pageHeight - (link.y / 100) * pageHeight;
    const yBottom = Math.max(0, yTop - (link.height / 100) * pageHeight);
    const annotation = pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x1, yBottom, x2, yTop],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(link.url),
      },
    });
    const ref = pdf.context.register(annotation);
    page.node.set(PDFName.of("Annots"), pdf.context.obj([ref]));
  }

  return pdf.save();
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeCertificateFilename(base: string, ext: "png" | "pdf"): string {
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "certificado"}.${ext}`;
}

export async function downloadCertificatePng(
  spec: CertificateRenderSpec,
  values: CertificateRenderValues,
  filenameBase: string,
): Promise<void> {
  const canvas = await renderCertificateToCanvas(spec, values);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode PNG");
  triggerDownload(blob, safeCertificateFilename(filenameBase, "png"));
}

export async function downloadCertificatePdf(
  spec: CertificateRenderSpec,
  values: CertificateRenderValues,
  meta: Omit<PdfCertificateMetadata, "verificationLink">,
  filenameBase: string,
): Promise<void> {
  const canvas = await renderCertificateToCanvas(spec, values);
  const jpegBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!jpegBlob) throw new Error("Could not encode JPEG for PDF");
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  const urlField = spec.fields.find((field) => field.kind === "verificationUrl" && field.enabled);
  const codeField = spec.fields.find((field) => field.kind === "verificationCode" && field.enabled);
  const qrField = spec.fields.find((field) => field.kind === "qr" && field.enabled);
  const linkAnchor = urlField ?? codeField ?? qrField;
  const verificationLink =
    linkAnchor && values.verificationUrl
      ? {
          url: values.verificationUrl,
          x: linkAnchor.x,
          y: linkAnchor.y,
          width: linkAnchor.width,
          height: linkAnchor.kind === "qr" ? (linkAnchor.width * canvas.width) / canvas.height : Math.max(3, linkAnchor.fontSize * 1.6),
        }
      : null;

  const pdfBytes = await buildCertificatePdfBytes({
    jpegBytes,
    width: canvas.width,
    height: canvas.height,
    meta: { ...meta, verificationLink },
  });
  triggerDownload(new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), safeCertificateFilename(filenameBase, "pdf"));
}
