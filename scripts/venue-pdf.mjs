// Turns the venue's PDF plan into the SVG the admin uploads in Mapa > Plano (run by hand, once per venue):
//
//   npm run venue:pdf -- path/to/plano.pdf [--out scripts/output] [--page 1]
//
// 1. Converts one page of the PDF into an optimized vector SVG: scripts/output/venue-plan.svg. Its black lines become
//    the theme's cyan and its black fills (text) a light grey, because the app draws the plan on a dark background.
// 2. Extracts every text label of that page with its position (as a % of the page) into
//    scripts/output/venue-labels.raw.json: a raw list (it includes dimensions, street names and labels split over
//    lines) to help place the areas on the grid in the admin.
//
// mupdf is AGPL-3.0: it is a development dependency used only on the organizer's computer and never runs in the
// deployed app. The admin then uploads the SVG, which the server cleans again before storing it.
// Adapted from the organizer's generate-venue-map.mjs.

import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";
import { optimize } from "svgo";

/** The theme's cyan (--cyan) for lines, and its muted text colour (--muted) for black fills such as text. */
const LINE_COLOR = "#22d3ee";
const TEXT_COLOR = "#b4bde0";

function parseArgs(argv) {
  const args = { pdf: null, out: "scripts/output", page: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--out") args.out = argv[++i];
    else if (value === "--page") args.page = Number(argv[++i]);
    else if (!args.pdf) args.pdf = value;
  }
  return args;
}

function loadPage(pdfPath, pageNumber) {
  const bytes = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pages = doc.countPages();
  if (pages < 1) throw new Error(`${pdfPath} has no pages`);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages) throw new Error(`--page must be between 1 and ${pages}`);
  return doc.loadPage(pageNumber - 1);
}

function renderSvg(page) {
  const bounds = page.getBounds();
  const buffer = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buffer, "svg", "");
  const device = writer.beginPage(bounds);
  page.run(device, mupdf.Matrix.identity);
  writer.endPage();
  writer.close();
  return buffer.asString();
}

const optimizeSvg = (raw) => optimize(raw, { multipass: true }).data;

/** Black in any spelling svgo may leave: #000, #000000 or "black". */
const BLACK = /(stroke|fill)="(?:#000|#000000|black)"/g;

function recolor(svg) {
  let lines = 0;
  let fills = 0;
  const out = svg.replace(BLACK, (_, attribute) => {
    if (attribute === "stroke") {
      lines += 1;
      return `stroke="${LINE_COLOR}"`;
    }
    fills += 1;
    return `fill="${TEXT_COLOR}"`;
  });
  // Text glyphs often carry no fill of their own (SVG then paints them black): give the root a light one to inherit.
  const rooted = /^<svg[^>]*\sfill=/.test(out) ? out : out.replace(/^<svg/, `<svg fill="${TEXT_COLOR}"`);
  if (rooted !== out) {
    console.log(`Unfilled shapes (usually text) now default to ${TEXT_COLOR}.`);
    return rooted;
  }
  if (lines + fills === 0) console.warn("Warning: no black lines or fills found; the SVG keeps its colours (check it on a dark background).");
  else console.log(`Recoloured ${lines} lines to ${LINE_COLOR} and ${fills} fills to ${TEXT_COLOR}.`);
  return out;
}

function extractLabels(page) {
  const [x0, y0, x1, y1] = page.getBounds();
  const pageWidth = x1 - x0;
  const pageHeight = y1 - y0;
  const json = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON());
  const labels = [];
  for (const block of json.blocks) {
    if (block.type !== "text") continue;
    for (const line of block.lines) {
      const text = line.text.trim();
      if (!text) continue;
      const { x, y, w, h } = line.bbox;
      labels.push({ text, xPct: +(((x + w / 2) / pageWidth) * 100).toFixed(2), yPct: +(((y + h / 2) / pageHeight) * 100).toFixed(2) });
    }
  }
  // Reading order: top to bottom, left to right, easier to review by hand.
  labels.sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct);
  return { labels, pageWidth, pageHeight };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pdf) {
    console.error("Usage: npm run venue:pdf -- path/to/plano.pdf [--out scripts/output] [--page 1]");
    process.exit(1);
  }
  const page = loadPage(args.pdf, args.page);
  fs.mkdirSync(args.out, { recursive: true });

  const raw = renderSvg(page);
  const svg = recolor(optimizeSvg(raw));
  const svgPath = path.join(args.out, "venue-plan.svg");
  fs.writeFileSync(svgPath, svg);
  console.log(`SVG: ${svgPath} (${(raw.length / 1024).toFixed(0)} KiB -> ${(svg.length / 1024).toFixed(0)} KiB after optimizing).`);
  if (svg.length > 5 * 1024 * 1024) console.warn("Warning: over 5 MB, the admin will refuse it. Try simplifying the PDF or another page.");

  const { labels, pageWidth, pageHeight } = extractLabels(page);
  const labelsPath = path.join(args.out, "venue-labels.raw.json");
  fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2));
  console.log(`${labels.length} text labels: ${labelsPath}`);
  console.log(`Page proportion: ${Math.round(pageWidth)} x ${Math.round(pageHeight)}. After uploading, "Ajustar la cuadrícula a la proporción del plano" matches the grid to it.`);
  console.log("Next: Mapa > Plano del local > Plano real del lugar > Subir imagen.");
}

main();
