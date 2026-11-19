import { describe, expect, it } from "vitest";
import { parseChannelMessage } from "./channel";

const CUE = { id: "cue-0001", kind: "slides", name: "Keynote", path: "apertura/keynote.pdf" };

describe("parseChannelMessage", () => {
  it("reads what the console says: a piece on the air, the transport and the ping", () => {
    expect(parseChannelMessage({ type: "program", cue: CUE, slide: 3, playing: false })).toEqual({ type: "program", cue: CUE, slide: 3, playing: false });
    expect(parseChannelMessage({ type: "program", cue: null, slide: 1, playing: false })).toEqual({ type: "program", cue: null, slide: 1, playing: false });
    expect(parseChannelMessage({ type: "transport", slide: 2, playing: true })).toEqual({ type: "transport", slide: 2, playing: true });
    expect(parseChannelMessage({ type: "ping" })).toEqual({ type: "ping" });
  });

  it("carries a Google Slides piece, and refuses one whose presentation id is not one", () => {
    const deck = { id: "cue-0009", kind: "gslides", name: "Keynote", deckId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", published: false };

    expect(parseChannelMessage({ type: "program", cue: deck, slide: 1, playing: false })).toEqual({ type: "program", cue: deck, slide: 1, playing: false });
    expect(parseChannelMessage({ type: "program", cue: { ...deck, deckId: "../x" }, slide: 1, playing: false })).toBeNull();
    expect(parseChannelMessage({ type: "program", cue: { ...deck, published: "yes" }, slide: 1, playing: false })).toBeNull();
  });

  it("keeps a file that comes with the piece (a browser that cannot remember the folder sends it)", () => {
    const file = new File(["x"], "keynote.pdf", { type: "application/pdf" });

    expect(parseChannelMessage({ type: "program", cue: CUE, slide: 1, playing: false, file })).toMatchObject({ type: "program", file });
    expect(parseChannelMessage({ type: "program", cue: CUE, slide: 1, playing: false, file: "no" })).not.toHaveProperty("file");
  });

  it("reads what the projector says: alive, loaded and failed", () => {
    expect(parseChannelMessage({ type: "alive", showing: null })).toEqual({ type: "alive", showing: null });
    expect(parseChannelMessage({ type: "alive", showing: "cue-0001" })).toEqual({ type: "alive", showing: "cue-0001" });
    expect(parseChannelMessage({ type: "loaded", cueId: "cue-0001", slides: 18 })).toEqual({ type: "loaded", cueId: "cue-0001", slides: 18 });
    expect(parseChannelMessage({ type: "loaded", cueId: "cue-0001", slides: null })).toEqual({ type: "loaded", cueId: "cue-0001", slides: null });
    expect(parseChannelMessage({ type: "failed", cueId: "cue-0001", reason: "missing" })).toEqual({ type: "failed", cueId: "cue-0001", reason: "missing" });
  });

  it.each([
    ["not an object", "hola"],
    ["an array", []],
    ["an unknown type", { type: "format-disk" }],
    ["a piece with a path outside the folder", { type: "program", cue: { ...CUE, path: "../x.pdf" }, slide: 1, playing: false }],
    ["a piece of an unknown kind", { type: "program", cue: { ...CUE, kind: "exe" }, slide: 1, playing: false }],
    ["a slide that is not a whole number", { type: "program", cue: CUE, slide: 1.5, playing: false }],
    ["a slide below one", { type: "transport", slide: 0, playing: false }],
    ["a play state that is not a boolean", { type: "transport", slide: 1, playing: "yes" }],
    ["a failure with an unknown reason", { type: "failed", cueId: "cue-0001", reason: "boom" }],
    ["a loaded piece without an id", { type: "loaded", cueId: "", slides: 2 }],
  ])("refuses %s", (_name, data) => {
    expect(parseChannelMessage(data)).toBeNull();
  });
});
