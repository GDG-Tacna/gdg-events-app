// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../domain/music";
import { MusicPlayer, type MusicPlayerHandle, type MusicWanted } from "./MusicPlayer";
import { fakeLibrary, mp3 } from "./test-helpers";

const INTRO: Track = { id: "song-0001", name: "Intro", path: "musica/intro.mp3" };
const CIERRE: Track = { id: "song-0002", name: "Cierre", path: "musica/cierre.mp3" };

let sounding = false;
let playBehaviour: () => Promise<void>;

function setup(files: Record<string, File> = { "musica/intro.mp3": mp3(), "musica/cierre.mp3": mp3("cierre.mp3") }) {
  const handle = createRef<MusicPlayerHandle>();
  const events = { onProgress: vi.fn(), onEnded: vi.fn(), onBlocked: vi.fn() };
  const { library } = fakeLibrary(files);
  const view = render(<MusicPlayer handleRef={handle} library={library} {...events} />);
  const audio = () => view.container.querySelector("audio") as HTMLAudioElement;
  const apply = async (wanted: Partial<MusicWanted> & { track: Track | null }, ms = 0) => {
    await act(async () => {
      handle.current?.apply({ playing: true, volume: 0.8, fadeMs: 0, ...wanted });
      for (let round = 0; round < 6; round += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  return { handle, events, audio, apply };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  sounding = false;
  playBehaviour = async () => {
    sounding = true;
  };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => playBehaviour());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {
    sounding = false;
  });
  Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => !sounding });
  let count = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:song-${(count += 1)}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MusicPlayer", () => {
  it("plays the song it is told to, fading the volume in over the time asked", async () => {
    const { apply, audio } = setup();
    await apply({ track: INTRO, fadeMs: 1000 });

    expect(audio().src).toBe("blob:song-1");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(audio().volume).toBeLessThan(0.8);

    await vi.advanceTimersByTimeAsync(1200);
    expect(audio().volume).toBeCloseTo(0.8, 1);
  });

  it("starts at the volume at once when there is no fade", async () => {
    const { apply, audio } = setup();
    await apply({ track: INTRO, volume: 0.5 });

    expect(audio().volume).toBe(0.5);
  });

  it("fades out and then pauses, and a new volume only moves it", async () => {
    const { apply, audio } = setup();
    await apply({ track: INTRO });
    await apply({ track: INTRO, volume: 0.3 });
    expect(audio().volume).toBeCloseTo(0.3);

    await apply({ track: INTRO, playing: false, volume: 0.3, fadeMs: 1000 }, 300);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio().volume).toBe(0);
  });

  it("changes song by fading the old one out first, then loading the new one", async () => {
    const { apply, audio } = setup();
    await apply({ track: INTRO });
    expect(audio().src).toBe("blob:song-1");

    await apply({ track: CIERRE, fadeMs: 1000 }, 200);
    expect(audio().src).toBe("blob:song-1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(audio().src).toBe("blob:song-2");
    expect(sounding).toBe(true);
  });

  it("fades out and unloads when there is no song", async () => {
    const { apply } = setup();
    await apply({ track: INTRO });
    await apply({ track: null, playing: false, fadeMs: 500 }, 700);

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("says a song ended when its file is not in the folder, so the console can go on", async () => {
    const { apply, events } = setup({});
    await apply({ track: INTRO });

    expect(events.onEnded).toHaveBeenCalledWith("song-0001");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("uses the file the console already holds (a browser that cannot remember the folder)", async () => {
    const { apply, audio } = setup({});
    await apply({ track: INTRO, file: mp3("enviada.mp3") });

    expect(audio().src).toBe("blob:song-1");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("says when the browser holds the sound back, and plays after a retry", async () => {
    playBehaviour = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    const { apply, handle, events } = setup();
    await apply({ track: INTRO });
    expect(events.onBlocked).toHaveBeenLastCalledWith(true);

    playBehaviour = async () => {
      sounding = true;
    };
    await act(async () => {
      handle.current?.retry();
      for (let round = 0; round < 6; round += 1) await Promise.resolve();
    });
    expect(events.onBlocked).toHaveBeenLastCalledWith(false);
    expect(sounding).toBe(true);
  });

  it("reports where the song is and when it ends, and jumps when asked", async () => {
    const { apply, audio, handle, events } = setup();
    await apply({ track: INTRO });
    Object.defineProperty(audio(), "duration", { configurable: true, value: 180 });
    audio().currentTime = 42;
    fireEvent.timeUpdate(audio());
    expect(events.onProgress).toHaveBeenCalledWith("song-0001", 42, 180);

    act(() => handle.current?.seek(90));
    expect(audio().currentTime).toBe(90);

    fireEvent.ended(audio());
    expect(events.onEnded).toHaveBeenCalledWith("song-0001");
  });

  it("does not report a song when none is loaded", () => {
    const { audio, events } = setup();
    fireEvent.timeUpdate(audio());
    fireEvent.ended(audio());

    expect(events.onProgress).not.toHaveBeenCalled();
    expect(events.onEnded).not.toHaveBeenCalled();
  });
});
