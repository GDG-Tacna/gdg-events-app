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

  it("carries the repetition and the sound, and refuses a wrong one", () => {
    const clip = { id: "cue-0001", kind: "video", name: "Video", path: "a/video.mp4" };
    const heard = parseChannelMessage({ type: "program", cue: clip, slide: 1, playing: true, loop: true, volume: 0.5, muted: false });
    expect(heard).toEqual({ type: "program", cue: clip, slide: 1, playing: true, loop: true, volume: 0.5, muted: false });
    expect(parseChannelMessage({ type: "transport", slide: 1, playing: true, volume: 0.25 })).toEqual({ type: "transport", slide: 1, playing: true, volume: 0.25 });
    expect(parseChannelMessage({ type: "transport", slide: 1, playing: true, volume: 2 })).toBeNull();
    expect(parseChannelMessage({ type: "transport", slide: 1, playing: true, loop: "yes" })).toBeNull();
    expect(parseChannelMessage({ type: "program", cue: clip, slide: 1, playing: true, muted: 1 })).toBeNull();
  });

  it("carries a jump to a second and the progress of the video", () => {
    expect(parseChannelMessage({ type: "seek", seconds: 12.5 })).toEqual({ type: "seek", seconds: 12.5 });
    expect(parseChannelMessage({ type: "seek", seconds: -1 })).toBeNull();
    expect(parseChannelMessage({ type: "seek", seconds: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseChannelMessage({ type: "progress", cueId: "cue-0001", time: 3, duration: 90 })).toEqual({ type: "progress", cueId: "cue-0001", time: 3, duration: 90 });
    expect(parseChannelMessage({ type: "progress", cueId: "", time: 3, duration: 90 })).toBeNull();
    expect(parseChannelMessage({ type: "progress", cueId: "cue-0001", time: Number.NaN, duration: 90 })).toBeNull();
  });

  it("carries what the music should do, with the song, the volume and the fade, and refuses a wrong one", () => {
    const song = { id: "song-0001", name: "Intro", path: "musica/intro.mp3" };
    const message = { type: "music", track: song, playing: true, volume: 0.8, fadeMs: 2000 };
    expect(parseChannelMessage(message)).toEqual(message);
    expect(parseChannelMessage({ ...message, track: null, playing: false })).toEqual({ ...message, track: null, playing: false });
    for (const bad of [{ ...message, track: { ...song, path: "../intro.mp3" } }, { ...message, track: { ...song, path: "musica/video.mp4" } }, { ...message, playing: "yes" }, { ...message, volume: 1.5 }, { ...message, volume: -0.1 }, { ...message, fadeMs: -1 }, { ...message, fadeMs: 20_000 }, { ...message, fadeMs: Number.NaN }]) {
      expect(parseChannelMessage(bad)).toBeNull();
    }
  });

  it("carries a jump to a second of the song and what the projector's window says back about the music", () => {
    expect(parseChannelMessage({ type: "musicSeek", seconds: 30 })).toEqual({ type: "musicSeek", seconds: 30 });
    expect(parseChannelMessage({ type: "musicSeek", seconds: -2 })).toBeNull();
    expect(parseChannelMessage({ type: "musicProgress", trackId: "song-0001", time: 3, duration: 200 })).toEqual({ type: "musicProgress", trackId: "song-0001", time: 3, duration: 200 });
    expect(parseChannelMessage({ type: "musicProgress", trackId: "", time: 3, duration: 200 })).toBeNull();
    expect(parseChannelMessage({ type: "musicEnded", trackId: "song-0001" })).toEqual({ type: "musicEnded", trackId: "song-0001" });
    expect(parseChannelMessage({ type: "musicEnded" })).toBeNull();
    expect(parseChannelMessage({ type: "musicBlocked", blocked: true })).toEqual({ type: "musicBlocked", blocked: true });
    expect(parseChannelMessage({ type: "musicBlocked", blocked: "yes" })).toBeNull();
    expect(parseChannelMessage({ type: "musicAlive", trackId: null })).toEqual({ type: "musicAlive", trackId: null });
    expect(parseChannelMessage({ type: "musicAlive", trackId: "song-0001" })).toEqual({ type: "musicAlive", trackId: "song-0001" });
    expect(parseChannelMessage({ type: "musicAlive", trackId: 5 })).toBeNull();
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
