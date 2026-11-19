import { describe, expect, it } from "vitest";
import { buildRundown, cueFromPath, isMediaPath, kindOfPath, moveCue, nameFromPath, parseCue, parseCues, qrCueId, queueOf } from "./rundown";

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
