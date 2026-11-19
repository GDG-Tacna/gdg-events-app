import { describe, expect, it } from "vitest";
import { buildRundown, cueFromPath, googleSlidesCueFromLink, googleSlidesEmbedUrl, googleSlidesPdfUrl, isFileCue, isMediaPath, kindOfPath, moveCue, nameFromPath, parseCue, parseCues, parseGoogleSlidesLink, qrCueId, queueOf } from "./rundown";

const SLIDES = { id: "cue-0001", kind: "slides", name: "Keynote", path: "apertura/keynote.pdf" } as const;

describe("kindOfPath", () => {
  it("tells what a file is by its extension, in any case, and refuses what the browser cannot show", () => {
    expect(kindOfPath("a/b/video.MP4")).toBe("video");
    expect(kindOfPath("a/deck.pdf")).toBe("slides");
    expect(kindOfPath("foto.JPG")).toBe("image");
    expect(kindOfPath("charla.pptx")).toBeNull();
    expect(kindOfPath("sin-extension")).toBeNull();
    expect(kindOfPath("carpeta.pdf/archivo")).toBeNull();
  });
});

describe("isMediaPath", () => {
  it("accepts a relative path with forward slashes to a file that can be shown", () => {
    expect(isMediaPath("genkit/agente-genkit.pdf")).toBe(true);
    expect(isMediaPath("video.webm")).toBe(true);
    expect(isMediaPath("Pausa del café/loop 1.mp4")).toBe(true);
  });

  it.each([
    ["an absolute path", "/etc/video.mp4"],
    ["a drive", "C:/videos/a.mp4"],
    ["a backslash", "genkit\\a.mp4"],
    ["a parent folder", "../secreto/a.mp4"],
    ["a parent in the middle", "a/../b.mp4"],
    ["an empty segment", "a//b.mp4"],
    ["a dot segment", "./a.mp4"],
    ["a trailing slash", "a/b.mp4/"],
    ["a control character", "a\nb.mp4"],
    ["a wildcard", "a*.mp4"],
    ["an unknown extension", "a/b.exe"],
    ["no path at all", ""],
  ])("refuses %s", (_name, path) => {
    expect(isMediaPath(path)).toBe(false);
  });

  it("refuses a path that is too long and anything that is not text", () => {
    expect(isMediaPath(`${"a".repeat(200)}.mp4`)).toBe(false);
    expect(isMediaPath(42)).toBe(false);
    expect(isMediaPath(null)).toBe(false);
  });
});

describe("cueFromPath and parseCue", () => {
  it("names a new piece after its file and gives it the kind of its extension", () => {
    expect(cueFromPath("genkit/agente-genkit_v2.pdf", "cue-0002")).toEqual({ id: "cue-0002", kind: "slides", name: "agente genkit v2", path: "genkit/agente-genkit_v2.pdf" });
    expect(nameFromPath("a/b/.mp4")).toBe(".mp4");
    expect(cueFromPath("a/b.exe", "cue-0002")).toBeNull();
    expect(cueFromPath("a/b.pdf", "x")).toBeNull();
  });

  it("reads a stored piece, and refuses one whose kind is not what its file is", () => {
    expect(parseCue(SLIDES)).toEqual(SLIDES);
    expect(parseCue({ ...SLIDES, extra: 1 })).toEqual(SLIDES);
    expect(parseCue({ ...SLIDES, kind: "video" })).toBeNull();
    expect(parseCue({ ...SLIDES, name: "   " })).toBeNull();
    expect(parseCue({ ...SLIDES, name: "x".repeat(81) })).toBeNull();
    expect(parseCue({ ...SLIDES, id: "a b" })).toBeNull();
    expect(parseCue({ ...SLIDES, path: "../x.pdf" })).toBeNull();
    expect(parseCue(null)).toBeNull();
  });

  it("reads a list, and refuses a repeated id, a bad piece or too many pieces", () => {
    const other = { id: "cue-0002", kind: "video", name: "Demo", path: "genkit/demo.mp4" };
    expect(parseCues([SLIDES, other])).toEqual([SLIDES, other]);
    expect(parseCues([])).toEqual([]);
    expect(parseCues([SLIDES, SLIDES])).toBeNull();
    expect(parseCues([SLIDES, { ...other, path: "x.exe" }])).toBeNull();
    expect(parseCues(Array.from({ length: 31 }, (_, i) => ({ ...SLIDES, id: `cue-${String(i).padStart(4, "0")}` })))).toBeNull();
    expect(parseCues("no")).toBeNull();
  });
});

const DECK = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const PUBLISHED = "2PACX-1vQabcdefghijklmnopqrstuvwxyz";

describe("Google Slides links", () => {
  it("finds the presentation in the forms of link Google gives, and whether it was published to the web", () => {
    expect(parseGoogleSlidesLink(`https://docs.google.com/presentation/d/${DECK}/edit?usp=sharing`)).toEqual({ deckId: DECK, published: false });
    expect(parseGoogleSlidesLink(`https://docs.google.com/presentation/d/${DECK}/preview`)).toEqual({ deckId: DECK, published: false });
    expect(parseGoogleSlidesLink(`  https://docs.google.com/presentation/d/${DECK}  `)).toEqual({ deckId: DECK, published: false });
    expect(parseGoogleSlidesLink(`https://docs.google.com/presentation/d/e/${PUBLISHED}/pub?start=false`)).toEqual({ deckId: PUBLISHED, published: true });
  });

  it.each([
    ["another site", "https://example.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz"],
    ["http instead of https", "http://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit"],
    ["a document, not a presentation", "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit"],
    ["a look-alike host", "https://docs.google.com.evil.example/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz"],
    ["an id that is too short", "https://docs.google.com/presentation/d/abc/edit"],
    ["text that is not a link", "mi presentación"],
    ["no text at all", 42],
  ])("refuses %s", (_name, text) => {
    expect(parseGoogleSlidesLink(text)).toBeNull();
  });

  it("makes a piece from a link, named by the admin or by default, and refuses what is not a deck", () => {
    expect(googleSlidesCueFromLink(`https://docs.google.com/presentation/d/${DECK}/edit`, "cue-0009", "  Keynote final ")).toEqual({ id: "cue-0009", kind: "gslides", name: "Keynote final", deckId: DECK, published: false });
    expect(googleSlidesCueFromLink(`https://docs.google.com/presentation/d/${DECK}/edit`, "cue-0009")?.name).toBe("Presentación de Google Slides");
    expect(googleSlidesCueFromLink("https://example.com", "cue-0009")).toBeNull();
    expect(googleSlidesCueFromLink(`https://docs.google.com/presentation/d/${DECK}`, "x")).toBeNull();
  });

  it("gives the address Google embeds: the clean embed when it is published, the preview when only shared", () => {
    expect(googleSlidesEmbedUrl({ deckId: PUBLISHED, published: true })).toBe(`https://docs.google.com/presentation/d/e/${PUBLISHED}/embed?start=false&loop=false&delayms=3000&rm=minimal`);
    expect(googleSlidesEmbedUrl({ deckId: DECK, published: false })).toBe(`https://docs.google.com/presentation/d/${DECK}/preview`);
    expect(googleSlidesPdfUrl({ deckId: DECK, published: false })).toBe(`https://docs.google.com/presentation/d/${DECK}/export/pdf`);
  });

  it("reads a stored Google Slides piece, and refuses one with a bad id, no published flag or no name", () => {
    const cue = { id: "cue-0009", kind: "gslides", name: "Keynote", deckId: DECK, published: false };
    expect(parseCue(cue)).toEqual(cue);
    expect(parseCue({ ...cue, extra: 1 })).toEqual(cue);
    expect(parseCue({ ...cue, deckId: "../x" })).toBeNull();
    expect(parseCue({ ...cue, deckId: "corto" })).toBeNull();
    expect(parseCue({ ...cue, published: "yes" })).toBeNull();
    expect(parseCue({ ...cue, name: "  " })).toBeNull();
    expect(parseCues([cue, { id: "cue-0001", kind: "slides", name: "Deck", path: "a/deck.pdf" }])).toHaveLength(2);
  });

  it("tells a file piece from a Google Slides one and from the QR", () => {
    expect(isFileCue({ id: "cue-0001", kind: "video", name: "V", path: "a.mp4" })).toBe(true);
    expect(isFileCue({ id: "cue-0009", kind: "gslides", name: "G", deckId: DECK, published: false })).toBe(false);
    expect(isFileCue({ id: "k:qr", kind: "qr", name: "QR" })).toBe(false);
  });
});

describe("moveCue", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves a piece up or down, and leaves the list alone at the ends or for an unknown id", () => {
    expect(moveCue(list, "b", -1).map((cue) => cue.id)).toEqual(["b", "a", "c"]);
    expect(moveCue(list, "b", 1).map((cue) => cue.id)).toEqual(["a", "c", "b"]);
    expect(moveCue(list, "a", -1).map((cue) => cue.id)).toEqual(["a", "b", "c"]);
    expect(moveCue(list, "c", 1).map((cue) => cue.id)).toEqual(["a", "b", "c"]);
    expect(moveCue(list, "zz", 1).map((cue) => cue.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildRundown and queueOf", () => {
  const agenda = [
    { id: "keynote", time: "09:00", title: "Keynote", who: "GDG" },
    { id: "cafe", time: "10:40", title: "Coffee Break", who: "GDG" },
  ];

  it("puts each point's stored pieces first and its QR last, and walks them in order", () => {
    const items = buildRundown(agenda, { keynote: [SLIDES] });

    expect(items[0].cues.map((cue) => cue.id)).toEqual(["cue-0001", qrCueId("keynote")]);
    expect(items[1].cues.map((cue) => cue.id)).toEqual([qrCueId("cafe")]);
    expect(queueOf(items).map((entry) => `${entry.itemId}:${entry.cue.id}`)).toEqual(["keynote:cue-0001", "keynote:keynote:qr", "cafe:cafe:qr"]);
  });

  it("leaves the QR out of the points that cannot check people in", () => {
    const items = buildRundown(agenda, {}, new Set(["keynote"]));

    expect(items[1].cues).toEqual([]);
  });
});
