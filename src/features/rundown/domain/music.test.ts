import { describe, expect, it } from "vitest";
import { cycleRepeat, forgetTrack, INITIAL_MUSIC, nextTrack, parseTrack, parseTracks, playTrack, previousTrack, setFadeSeconds, setMusicVolume, soundingOf, stopMusic, toggleDuck, togglePlayback, trackFromPath, TRACKS_MAX, type MusicState, type Track } from "./music";

const a: Track = { id: "song-0001", name: "Intro", path: "musica/intro.mp3" };
const b: Track = { id: "song-0002", name: "Medio", path: "musica/medio.mp3" };
const c: Track = { id: "song-0003", name: "Cierre", path: "musica/cierre.m4a" };
const tracks = [a, b, c];
const loaded = (overrides: Partial<MusicState> = {}): MusicState => ({ ...INITIAL_MUSIC, trackId: b.id, playing: true, ...overrides });

describe("songs", () => {
  it("reads a song, trimming its name, and refuses a bad id, a file that is not audio, a path outside the folder and an empty or long name", () => {
    expect(parseTrack({ ...a, name: "  Intro " })).toEqual(a);
    for (const bad of [null, "x", { ...a, id: "x" }, { ...a, path: "musica/video.mp4" }, { ...a, path: "../intro.mp3" }, { ...a, name: " " }, { ...a, name: "x".repeat(81) }, { ...a, name: 3 }]) {
      expect(parseTrack(bad)).toBeNull();
    }
  });

  it("reads a playlist of up to 100 songs, none repeating an id", () => {
    expect(parseTracks(tracks)).toEqual(tracks);
    expect(parseTracks([])).toEqual([]);
    expect(parseTracks([a, a])).toBeNull();
    expect(parseTracks("x")).toBeNull();
    expect(parseTracks(Array.from({ length: TRACKS_MAX + 1 }, (_, index) => ({ ...a, id: `song-${String(index).padStart(4, "0")}` })))).toBeNull();
  });

  it("makes a song from a path, named after its file", () => {
    expect(trackFromPath("musica/mi-cancion_final.mp3", "song-0009")).toEqual({ id: "song-0009", name: "mi cancion final", path: "musica/mi-cancion_final.mp3" });
    expect(trackFromPath("musica/video.mp4", "song-0009")).toBeNull();
    expect(trackFromPath("musica/a.mp3", "x")).toBeNull();
  });
});

describe("playing the playlist", () => {
  it("plays a song from the list, the loaded one, or the first, and ignores one that is not there", () => {
    expect(playTrack(INITIAL_MUSIC, tracks, c.id)).toMatchObject({ trackId: c.id, playing: true });
    expect(playTrack(loaded({ playing: false }), tracks)).toMatchObject({ trackId: b.id, playing: true });
    expect(playTrack(INITIAL_MUSIC, tracks)).toMatchObject({ trackId: a.id, playing: true });
    expect(playTrack(INITIAL_MUSIC, tracks, "ghost")).toBe(INITIAL_MUSIC);
    expect(playTrack(INITIAL_MUSIC, [])).toBe(INITIAL_MUSIC);
  });

  it("plays and pauses the loaded song, and stops by unloading it", () => {
    expect(togglePlayback(loaded(), tracks)).toMatchObject({ trackId: b.id, playing: false });
    expect(togglePlayback(loaded({ playing: false }), tracks)).toMatchObject({ trackId: b.id, playing: true });
    expect(togglePlayback(INITIAL_MUSIC, tracks)).toMatchObject({ trackId: a.id, playing: true });
    expect(stopMusic(loaded())).toMatchObject({ trackId: null, playing: false });
  });

  it("moves on with «siguiente» and wraps around, keeping paused if it was paused", () => {
    expect(nextTrack(loaded(), tracks)).toMatchObject({ trackId: c.id, playing: true });
    expect(nextTrack(loaded({ trackId: c.id }), tracks)).toMatchObject({ trackId: a.id });
    expect(nextTrack(loaded({ playing: false }), tracks)).toMatchObject({ trackId: c.id, playing: false });
    expect(nextTrack(loaded(), [])).toEqual(loaded());
  });

  it("when a song ends by itself, honours the repeat mode: the list goes on, one repeats itself, no repeat stops at the end", () => {
    expect(nextTrack(loaded({ repeat: "all" }), tracks, true)).toMatchObject({ trackId: c.id, playing: true });
    expect(nextTrack(loaded({ repeat: "all", trackId: c.id }), tracks, true)).toMatchObject({ trackId: a.id, playing: true });
    expect(nextTrack(loaded({ repeat: "one" }), tracks, true)).toMatchObject({ trackId: b.id, playing: true });
    expect(nextTrack(loaded({ repeat: "off", trackId: c.id }), tracks, true)).toMatchObject({ trackId: c.id, playing: false });
    expect(nextTrack(loaded({ repeat: "off" }), tracks, true)).toMatchObject({ trackId: c.id, playing: true });
  });

  it("goes back with «anterior», wrapping around to the last song", () => {
    expect(previousTrack(loaded(), tracks)).toMatchObject({ trackId: a.id });
    expect(previousTrack(loaded({ trackId: a.id }), tracks)).toMatchObject({ trackId: c.id });
    expect(previousTrack(INITIAL_MUSIC, tracks)).toMatchObject({ trackId: c.id });
    expect(previousTrack(loaded(), [])).toEqual(loaded());
  });
});

describe("settings of the music", () => {
  it("holds the volume between 0 and 1, the fade between 0 and 10 whole seconds, and cycles the repeat mode", () => {
    expect(setMusicVolume(INITIAL_MUSIC, 0.456).volume).toBe(0.46);
    expect(setMusicVolume(INITIAL_MUSIC, 5).volume).toBe(1);
    expect(setMusicVolume(INITIAL_MUSIC, -1).volume).toBe(0);
    expect(setMusicVolume(INITIAL_MUSIC, Number.NaN)).toBe(INITIAL_MUSIC);
    expect(setFadeSeconds(INITIAL_MUSIC, 5).fadeSeconds).toBe(5);
    for (const bad of [-1, 11, 2.5, Number.NaN]) expect(setFadeSeconds(INITIAL_MUSIC, bad)).toBe(INITIAL_MUSIC);
    expect([cycleRepeat({ ...INITIAL_MUSIC, repeat: "off" }).repeat, cycleRepeat({ ...INITIAL_MUSIC, repeat: "all" }).repeat, cycleRepeat({ ...INITIAL_MUSIC, repeat: "one" }).repeat]).toEqual(["all", "one", "off"]);
    expect(toggleDuck(INITIAL_MUSIC).duck).toBe(false);
  });

  it("lets go of a song taken out of the list only if it was the loaded one", () => {
    expect(forgetTrack(loaded(), b.id)).toMatchObject({ trackId: null, playing: false });
    expect(forgetTrack(loaded(), a.id)).toEqual(loaded());
  });

  it("sounds only when it is set to play with a song loaded, and fades out of the way of a video when it should", () => {
    expect(soundingOf(loaded(), false)).toBe(true);
    expect(soundingOf(loaded(), true)).toBe(false);
    expect(soundingOf(loaded({ duck: false }), true)).toBe(true);
    expect(soundingOf(loaded({ playing: false }), false)).toBe(false);
    expect(soundingOf({ ...INITIAL_MUSIC, playing: true }, false)).toBe(false);
  });
});
