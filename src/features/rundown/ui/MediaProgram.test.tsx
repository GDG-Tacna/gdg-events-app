// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelMessage } from "../domain/channel";
import { MediaProgram, ALIVE_EVERY_MS } from "./MediaProgram";
import { channelPair, fakeLibrary, mp4, pdf, png } from "./test-helpers";

// The deck is drawn by pdf.js, which needs a real browser: a stand-in that says which page it was asked for.
vi.mock("./SlideCanvas", () => ({
  SlideCanvas: ({ file, page, label, onLoaded }: { file: File | null; page: number; label: string; onLoaded?: (pages: number) => void }) => (
    <button type="button" data-testid="deck" data-file={file?.name ?? ""} data-page={page} onClick={() => onLoaded?.(12)}>
      {label}
    </button>
  ),
}));

const SLIDES = { id: "cue-slides", kind: "slides" as const, name: "Keynote", path: "apertura/keynote.pdf" };
const VIDEO = { id: "cue-video", kind: "video" as const, name: "Video de apertura", path: "apertura/video.mp4" };
const IMAGE = { id: "cue-image", kind: "image" as const, name: "Portada", path: "portada.png" };

function setup(files = { "apertura/keynote.pdf": pdf(), "apertura/video.mp4": mp4(), "portada.png": png() }) {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.console.subscribe((message) => heard.push(message));
  const { library } = fakeLibrary(files);
  const view = render(<MediaProgram library={library} openChannel={() => lines.stage} />);
  // The file is read from the folder after the message arrives: let those promises settle before looking.
  const say = (message: ChannelMessage) =>
    act(async () => {
      lines.console.post(message);
      for (let round = 0; round < 4; round += 1) await Promise.resolve();
    });
  return { heard, say, view };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MediaProgram", () => {
  it("badges the piece on the air as live, and a deck with the number of its slide, which leave on their own", async () => {
    const { say, view } = setup();
    await say({ type: "program", cue: SLIDES, slide: 4, playing: false });
    fireEvent.click(screen.getByTestId("deck"));

    const badges = () => view.container.querySelector(".stage-badges");
    expect(badges()).toHaveTextContent("En vivo");
    expect(badges()).toHaveTextContent("Lámina 4 de 12");

    // A new slide shows them again: they mount anew with it.
    const before = badges();
    await say({ type: "transport", slide: 5, playing: false });
    expect(badges()).toHaveTextContent("Lámina 5 de 12");
    expect(badges()).not.toBe(before);
  });

  it("as the console's small copy, shows the piece muted and says nothing back (it is not a second projector)", async () => {
    const lines = channelPair();
    const heard: ChannelMessage[] = [];
    lines.console.subscribe((message) => heard.push(message));
    const { library } = fakeLibrary({ "apertura/video.mp4": mp4() });
    const { container } = render(<MediaProgram preview library={library} openChannel={() => lines.stage} />);
    await act(async () => {
      lines.console.post({ type: "program", cue: VIDEO, slide: 1, playing: true });
      for (let round = 0; round < 4; round += 1) await Promise.resolve();
      vi.advanceTimersByTime(ALIVE_EVERY_MS * 3);
    });

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(screen.queryByText("Haz clic en la pantalla para activar el sonido")).not.toBeInTheDocument();
    expect(heard).toEqual([]);
  });

  it("plays the video on repeat, at the volume and mute the console says, and reports where it is", async () => {
    const { heard, say, view } = setup();
    await say({ type: "program", cue: VIDEO, slide: 1, playing: true, loop: true, volume: 0.4, muted: false });
    const video = view.container.querySelector("video") as HTMLVideoElement;

    expect(video.loop).toBe(true);
    expect(video.volume).toBeCloseTo(0.4);
    await say({ type: "transport", slide: 1, playing: true, loop: false, muted: true });
    expect(video.loop).toBe(false);
    expect(video.muted).toBe(true);

    Object.defineProperty(video, "duration", { configurable: true, value: 90 });
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    expect(heard).toContainEqual({ type: "progress", cueId: "cue-video", time: 12, duration: 90 });
  });

  it("jumps the video to the second the console asks for", async () => {
    const { say, view } = setup();
    await say({ type: "program", cue: VIDEO, slide: 1, playing: true });
    const video = view.container.querySelector("video") as HTMLVideoElement;

    await say({ type: "seek", seconds: 33 });
    expect(video.currentTime).toBe(33);
  });

  it("badges a video as live, with no slide number", async () => {
    const { say, view } = setup();
    await say({ type: "program", cue: VIDEO, slide: 1, playing: true });

    expect(view.container.querySelector(".stage-badges")).toHaveTextContent("En vivo");
    expect(view.container.querySelector(".stage-badges")).not.toHaveTextContent("Lámina");
  });

  it("shows nothing until the console puts a file on the air, and says it is there", async () => {
    const { heard, view } = setup();
    await act(async () => {});

    expect(view.container).toBeEmptyDOMElement();
    expect(heard).toContainEqual({ type: "alive", showing: null });
  });

  it("answers a ping at once and repeats that it is alive every couple of seconds", async () => {
    const { heard, say } = setup();
    await act(async () => {});
    heard.length = 0;

    await say({ type: "ping" });
    expect(heard).toEqual([{ type: "alive", showing: null }]);

    await act(async () => {
      vi.advanceTimersByTime(ALIVE_EVERY_MS * 2);
    });
    expect(heard.filter((message) => message.type === "alive")).toHaveLength(3);
  });

  it("shows the page of a deck, follows the slide the console moves to, and says how many pages it has", async () => {
    const { heard, say } = setup();
    await say({ type: "program", cue: SLIDES, slide: 1, playing: false });

    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-file", "keynote.pdf");
    expect(deck).toHaveAttribute("data-page", "1");

    await say({ type: "transport", slide: 5, playing: false });
    expect(screen.getByTestId("deck")).toHaveAttribute("data-page", "5");

    fireEvent.click(screen.getByTestId("deck"));
    expect(heard).toContainEqual({ type: "loaded", cueId: "cue-slides", slides: 12 });
  });

  it("shows a Google Slides deck in Google's own frame, sandboxed, and says it is ready when it loads", async () => {
    const { heard, say } = setup({} as never);
    const deck = { id: "cue-deck", kind: "gslides" as const, name: "Keynote en Google Slides", deckId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", published: false };

    await say({ type: "program", cue: deck, slide: 1, playing: false });

    const frame = screen.getByTitle("Keynote en Google Slides");
    expect(frame).toHaveAttribute("src", "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/preview");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.load(frame);
    expect(heard).toContainEqual({ type: "loaded", cueId: "cue-deck", slides: null });
    // It needs no file from the folder: nothing is reported missing.
    expect(heard.some((message) => message.type === "failed")).toBe(false);
  });

  it("plays a video from the folder when the console says so, and pauses it when it says to", async () => {
    const { say } = setup();
    await say({ type: "program", cue: VIDEO, slide: 1, playing: true });

    const video = document.querySelector("video")!;
    expect(video).toHaveAttribute("src", "blob:local-file");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // The browser keeps sound off until the page was used: a hint says to click.
    expect(video.muted).toBe(true);
    expect(screen.getByText(/activar el sonido/i)).toBeInTheDocument();

    await say({ type: "transport", slide: 1, playing: false });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("lets the video sound after a click on the screen", async () => {
    const { say } = setup();
    await say({ type: "program", cue: VIDEO, slide: 1, playing: true });

    fireEvent.click(screen.getByRole("presentation"));

    expect(document.querySelector("video")!.muted).toBe(false);
    expect(screen.queryByText(/activar el sonido/i)).not.toBeInTheDocument();
  });

  it("shows a picture, says it is ready, and covers nothing once the console takes it off", async () => {
    const { heard, say, view } = setup();
    await say({ type: "program", cue: IMAGE, slide: 1, playing: false });

    const picture = screen.getByRole("img", { name: "Portada" });
    fireEvent.load(picture);
    expect(heard).toContainEqual({ type: "loaded", cueId: "cue-image", slides: null });

    await say({ type: "program", cue: null, slide: 1, playing: false });
    expect(view.container).toBeEmptyDOMElement();
  });

  it("does not show a file that is not in the folder, and tells the console so, instead of going black", async () => {
    const { heard, say, view } = setup({} as never);
    await say({ type: "program", cue: SLIDES, slide: 1, playing: false });
    await act(async () => {});

    expect(view.container).toBeEmptyDOMElement();
    expect(heard).toContainEqual({ type: "failed", cueId: "cue-slides", reason: "missing" });
  });

  it("uses the file the console sends along when the browser cannot remember the folder", async () => {
    const { say } = setup({} as never);
    const sent = pdf("enviado.pdf");

    await say({ type: "program", cue: SLIDES, slide: 1, playing: false, file: sent });

    expect(screen.getByTestId("deck")).toHaveAttribute("data-file", "enviado.pdf");
  });

  it("says which piece it shows when the console asks again", async () => {
    const { heard, say } = setup();
    await say({ type: "program", cue: IMAGE, slide: 1, playing: false });
    await act(async () => {});
    heard.length = 0;

    await say({ type: "ping" });

    expect(heard).toEqual([{ type: "alive", showing: "cue-image" }]);
  });
});
