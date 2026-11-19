// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { ChannelMessage } from "../domain/channel";
import type { Track } from "../domain/music";
import { MusicProgram } from "./MusicProgram";
import { channelPair, fakeLibrary, mp3 } from "./test-helpers";

const INTRO: Track = { id: "song-0001", name: "Intro", path: "musica/intro.mp3" };
const CIERRE: Track = { id: "song-0002", name: "Cierre", path: "musica/cierre.mp3" };

let sounding = false;
let playBehaviour: () => Promise<void>;

function setup(files: Record<string, File> = { "musica/intro.mp3": mp3(), "musica/cierre.mp3": mp3("cierre.mp3") }, props: { preview?: boolean } = {}) {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.console.subscribe((message) => heard.push(message));
  const { library } = fakeLibrary(files);
  const view = render(<MusicProgram library={library} openChannel={() => lines.stage} {...props} />);
  const say = (message: ChannelMessage, ms = 0) =>
    act(async () => {
      lines.console.post(message);
      for (let round = 0; round < 6; round += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(ms);
    });
  const audio = () => view.container.querySelector("audio") as HTMLAudioElement;
  return { heard, say, audio, view };
}

const music = (track: Track | null, playing: boolean, volume = 0.8, fadeMs = 0): ChannelMessage => ({ type: "music", track, playing, volume, fadeMs });

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

describe("MusicProgram", () => {
  it("plays the song it is told to, fading the volume in over the time asked", async () => {
    const { say, audio } = setup();
    await say(music(INTRO, true, 0.8, 1000));

    expect(audio().src).toBe("blob:song-1");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(audio().volume).toBeLessThan(0.8);

    await vi.advanceTimersByTimeAsync(1200);
    expect(audio().volume).toBeCloseTo(0.8, 1);
  });

  it("starts at the volume at once when there is no fade", async () => {
    const { say, audio } = setup();
    await say(music(INTRO, true, 0.5, 0));

    expect(audio().volume).toBe(0.5);
  });

  it("fades out and then pauses, and a new volume only moves it", async () => {
    const { say, audio } = setup();
    await say(music(INTRO, true, 0.8, 0));
    await say(music(INTRO, true, 0.3, 0));
    expect(audio().volume).toBeCloseTo(0.3);

    await say(music(INTRO, false, 0.3, 1000), 300);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio().volume).toBe(0);
  });

  it("changes song by fading the old one out first, then loading the new one", async () => {
    const { say, audio } = setup();
    await say(music(INTRO, true, 0.8, 0));
    expect(audio().src).toBe("blob:song-1");

    await say(music(CIERRE, true, 0.8, 1000), 200);
    // Still the old song while it fades out.
    expect(audio().src).toBe("blob:song-1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(audio().src).toBe("blob:song-2");
    expect(sounding).toBe(true);
  });

  it("fades out and unloads when there is no song", async () => {
    const { say, heard } = setup();
    await say(music(INTRO, true, 0.8, 0));
    await say(music(null, false, 0.8, 500));
    await vi.advanceTimersByTimeAsync(700);

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(heard).toContainEqual({ type: "musicAlive", trackId: null });
  });

  it("tells the console a song ended when its file is not in the folder, so it can go on", async () => {
    const { say, heard } = setup({});
    await say(music(INTRO, true));

    expect(heard).toContainEqual({ type: "musicEnded", trackId: "song-0001" });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("uses the file the console sent along (a browser that cannot remember the folder)", async () => {
    const { say, audio } = setup({});
    await say({ type: "music", track: INTRO, playing: true, volume: 0.8, fadeMs: 0, file: mp3("enviada.mp3") });

    expect(audio().src).toBe("blob:song-1");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("says when the browser holds the sound back, offers a button to unlock it, and plays after the click", async () => {
    playBehaviour = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    const { say, heard } = setup();
    await say(music(INTRO, true));

    expect(heard).toContainEqual({ type: "musicBlocked", blocked: true });
    playBehaviour = async () => {
      sounding = true;
    };
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.stageConsole.music.unlock }));
      for (let round = 0; round < 6; round += 1) await Promise.resolve();
    });
    expect(heard).toContainEqual({ type: "musicBlocked", blocked: false });
    expect(screen.queryByRole("button", { name: copy.stageConsole.music.unlock })).not.toBeInTheDocument();
    expect(sounding).toBe(true);
  });

  it("reports where the song is and when it ends, and jumps when asked", async () => {
    const { say, audio, heard } = setup();
    await say(music(INTRO, true));
    Object.defineProperty(audio(), "duration", { configurable: true, value: 180 });
    audio().currentTime = 42;
    fireEvent.timeUpdate(audio());
    expect(heard).toContainEqual({ type: "musicProgress", trackId: "song-0001", time: 42, duration: 180 });

    await say({ type: "musicSeek", seconds: 90 });
    expect(audio().currentTime).toBe(90);

    fireEvent.ended(audio());
    expect(heard).toContainEqual({ type: "musicEnded", trackId: "song-0001" });
  });

  it("says it is there with the song it has loaded, when it opens and each time the console asks", async () => {
    const { say, heard } = setup();
    expect(heard).toContainEqual({ type: "musicAlive", trackId: null });

    await say(music(INTRO, true));
    await say({ type: "ping" });
    expect(heard.filter((message) => message.type === "musicAlive").at(-1)).toEqual({ type: "musicAlive", trackId: "song-0001" });
  });

  it("is silent as the console's small copy: no audio, no messages", async () => {
    const { say, heard, view } = setup(undefined, { preview: true });
    await say(music(INTRO, true));

    expect(view.container.querySelector("audio")).toBeNull();
    expect(heard).toEqual([]);
  });
});
