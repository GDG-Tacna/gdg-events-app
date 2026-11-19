import { describe, expect, it } from "vitest";
import { back, cueOf, followingOf, forget, forward, goToSlide, INITIAL_PLAYOUT, mediaOnProgram, selectNext, setVolume, showScene, startOf, stop, take, toggleLoop, toggleMute, togglePlay, type PlayoutState } from "./playout";
import { buildRundown, queueOf, type MediaCue } from "./rundown";

const deck: MediaCue = { id: "deck-1", kind: "slides", name: "Keynote", path: "a/keynote.pdf" };
const clip: MediaCue = { id: "clip-1", kind: "video", name: "Video", path: "a/video.mp4" };
const photo: MediaCue = { id: "foto-1", kind: "image", name: "Foto", path: "a/foto.png" };
const queue = queueOf(buildRundown([{ id: "keynote", time: "09:00", title: "Keynote", who: "GDG" }, { id: "cafe", time: "10:40", title: "Cafe", who: "GDG" }], { keynote: [deck, clip], cafe: [photo] }));
// deck-1, clip-1, keynote:qr, foto-1, cafe:qr

const taken = (state: PlayoutState, count: number) => Array.from({ length: count }).reduce<PlayoutState>((current) => take(current, queue), state);

describe("playout", () => {
  it("starts with the first piece waiting and nothing on the air", () => {
    expect(startOf(queue)).toEqual({ program: null, next: "deck-1", slide: 1, playing: false, loop: false, volume: 1, muted: false });
    expect(startOf([])).toEqual(INITIAL_PLAYOUT);
  });

  it("takes the waiting piece onto the air from its start, and the one after it waits", () => {
    const first = take(startOf(queue), queue);

    expect(first).toEqual({ program: { type: "cue", cueId: "deck-1" }, next: "clip-1", slide: 1, playing: false, loop: false, volume: 1, muted: false });
    // A video starts playing when it is taken.
    expect(take(first, queue)).toEqual({ program: { type: "cue", cueId: "clip-1" }, next: "keynote:qr", slide: 1, playing: true, loop: false, volume: 1, muted: false });
  });

  it("repeats only a video, and every piece that is taken starts without repetition", () => {
    const onDeck = take(startOf(queue), queue);
    expect(toggleLoop(onDeck, queue)).toBe(onDeck);

    const onClip = take(onDeck, queue);
    const looping = toggleLoop(onClip, queue);
    expect(looping.loop).toBe(true);
    expect(toggleLoop(looping, queue).loop).toBe(false);
    expect(take(looping, queue).loop).toBe(false);
  });

  it("keeps the sound between pieces: the volume is held in steps of a hundredth and raising it lifts the mute", () => {
    const quiet = setVolume(startOf(queue), 0.456);
    expect(quiet.volume).toBe(0.46);
    expect(setVolume(quiet, 3).volume).toBe(1);
    expect(setVolume(quiet, -1).volume).toBe(0);
    expect(setVolume(quiet, Number.NaN)).toBe(quiet);

    const muted = toggleMute(quiet);
    expect(muted.muted).toBe(true);
    expect(setVolume(muted, 0).muted).toBe(true);
    expect(setVolume(muted, 0.5).muted).toBe(false);
    expect(take(muted, queue)).toMatchObject({ volume: 0.46, muted: true });
  });

  it("does nothing when nothing waits, at the end of the order or with a piece that is not in it", () => {
    const last = taken(startOf(queue), 5);

    expect(last.next).toBeNull();
    expect(take(last, queue)).toBe(last);
    expect(take({ ...startOf(queue), next: "ghost" }, queue)).toEqual({ ...startOf(queue), next: "ghost" });
  });

  it("lets the operator pick what comes next, but only from the order", () => {
    const state = startOf(queue);

    expect(selectNext(state, queue, "foto-1").next).toBe("foto-1");
    expect(selectNext(state, queue, "ghost")).toBe(state);
    expect(take(selectNext(state, queue, "foto-1"), queue).program).toEqual({ type: "cue", cueId: "foto-1" });
  });

  it("moves through the slides of a deck, and takes the next piece after the last slide", () => {
    let state = take(startOf(queue), queue);

    state = forward(state, queue, 3);
    state = forward(state, queue, 3);
    expect(state.slide).toBe(3);
    // The last slide: the next press takes the waiting piece.
    state = forward(state, queue, 3);
    expect(state.program).toEqual({ type: "cue", cueId: "clip-1" });
    expect(state.slide).toBe(1);
  });

  it("goes back a slide inside a deck, and nowhere else", () => {
    const deckOnAir = { ...take(startOf(queue), queue), slide: 3 };

    expect(back(deckOnAir, queue).slide).toBe(2);
    expect(back({ ...deckOnAir, slide: 1 }, queue).slide).toBe(1);
    const video = take(deckOnAir, queue);
    expect(back(video, queue)).toBe(video);
    expect(back(INITIAL_PLAYOUT, queue)).toBe(INITIAL_PLAYOUT);
  });

  it("jumps to a slide, kept inside the deck", () => {
    const deckOnAir = take(startOf(queue), queue);

    expect(goToSlide(deckOnAir, queue, 5, 9).slide).toBe(5);
    expect(goToSlide(deckOnAir, queue, 99, 9).slide).toBe(9);
    expect(goToSlide(deckOnAir, queue, 0, 9).slide).toBe(1);
    expect(goToSlide(deckOnAir, queue, 2.5, 9)).toBe(deckOnAir);
    const video = take(deckOnAir, queue);
    expect(goToSlide(video, queue, 3, 9)).toBe(video);
  });

  it("plays and pauses a video only", () => {
    const video = taken(startOf(queue), 2);

    expect(video.playing).toBe(true);
    expect(togglePlay(video, queue).playing).toBe(false);
    expect(togglePlay(togglePlay(video, queue), queue).playing).toBe(true);
    const deckOnAir = take(startOf(queue), queue);
    expect(togglePlay(deckOnAir, queue)).toBe(deckOnAir);
  });

  it("puts a data scene on the air without losing what waits, and stops to the waiting screen", () => {
    const state = showScene(taken(startOf(queue), 2), "ranking");

    expect(state.program).toEqual({ type: "scene", scene: "ranking" });
    expect(state.next).toBe("keynote:qr");
    expect(state.playing).toBe(false);
    expect(stop(taken(startOf(queue), 2)).program).toEqual({ type: "scene", scene: "waiting" });
  });

  it("tells which file is on the air: none for a scene or for the QR", () => {
    expect(mediaOnProgram(take(startOf(queue), queue), queue)).toEqual(deck);
    expect(mediaOnProgram(showScene(INITIAL_PLAYOUT, "poll"), queue)).toBeNull();
    expect(mediaOnProgram(taken(startOf(queue), 3), queue)).toBeNull();
    expect(mediaOnProgram(INITIAL_PLAYOUT, queue)).toBeNull();
  });

  it("finds a piece and the one that follows it", () => {
    expect(cueOf(queue, "clip-1")).toEqual(clip);
    expect(cueOf(queue, "ghost")).toBeNull();
    expect(cueOf(queue, null)).toBeNull();
    expect(followingOf(queue, "deck-1")).toBe("clip-1");
    expect(followingOf(queue, "cafe:qr")).toBeNull();
    expect(followingOf(queue, "ghost")).toBeNull();
  });

  it("lets go of a removed piece: the waiting screen if it was on the air, the next one if it was waiting", () => {
    const onAir = take(startOf(queue), queue);

    expect(forget(onAir, queue, "deck-1")).toMatchObject({ program: { type: "scene", scene: "waiting" }, playing: false });
    expect(forget(onAir, queue, "clip-1").next).toBe("keynote:qr");
    expect(forget(onAir, queue, "foto-1")).toEqual(onAir);
  });
});
