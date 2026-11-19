// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { ChannelMessage } from "../domain/channel";
import type { MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, mp4, pdf } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

const t = copy.stageConsole;
const DECK: MediaCue = { id: "deck-1", kind: "slides", name: "Diapositivas", path: "apertura/keynote.pdf" };
const CLIP: MediaCue = { id: "clip-1", kind: "video", name: "Video de apertura", path: "apertura/video.mp4" };

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup() {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary({ "apertura/keynote.pdf": pdf(), "apertura/video.mp4": mp4() });
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={[{ id: "keynote", time: "09:00", title: "Keynote", who: "Equipo GDG" }]}
      qrItems={["keynote"]}
      stored={{ keynote: [DECK, CLIP] }}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }))}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
  return { heard, stage: lines.stage };
}

const take = async () => {
  fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
  await settle();
};

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
});

describe("the controls of the video on the air", () => {
  it("appear only for a video", async () => {
    setup();
    await settle();
    await take();
    expect(screen.queryByRole("region", { name: t.video.label })).not.toBeInTheDocument();

    await take();
    expect(screen.getByRole("region", { name: t.video.label })).toBeInTheDocument();
  });

  it("turn the repetition on and tell the projector's window, which a new piece starts without", async () => {
    const { heard } = setup();
    await settle();
    await take();
    await take();

    fireEvent.click(screen.getByRole("button", { name: t.video.loop }));
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 1, playing: true, loop: true, volume: 1, muted: false });
    expect(screen.getByRole("button", { name: t.video.loop })).toHaveAttribute("aria-pressed", "true");
  });

  it("carry the volume and the mute to the projector's window", async () => {
    const { heard } = setup();
    await settle();
    await take();
    await take();

    fireEvent.change(screen.getByRole("slider", { name: t.video.volume }), { target: { value: "0.4" } });
    await settle();
    expect(heard.at(-1)).toMatchObject({ type: "transport", volume: 0.4, muted: false });

    fireEvent.click(screen.getByRole("button", { name: t.video.mute }));
    await settle();
    expect(heard.at(-1)).toMatchObject({ type: "transport", muted: true });
  });

  it("jump to a second, restart, and show the progress the projector's window reports", async () => {
    const { heard, stage } = setup();
    await settle();
    await take();
    await take();

    expect(screen.getByRole("slider", { name: t.video.position })).toBeDisabled();
    await act(async () => stage.post({ type: "progress", cueId: "clip-1", time: 30, duration: 100 }));
    expect(screen.getByText("0:30 de 1:40")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: t.video.position }), { target: { value: "75" } });
    expect(heard.at(-1)).toEqual({ type: "seek", seconds: 75 });
    fireEvent.click(screen.getByRole("button", { name: t.video.restart }));
    expect(heard.at(-1)).toEqual({ type: "seek", seconds: 0 });
  });

  it("ignore the progress of a video that is not the one on the air", async () => {
    const { stage } = setup();
    await settle();
    await take();
    await take();

    await act(async () => stage.post({ type: "progress", cueId: "other", time: 30, duration: 100 }));
    expect(screen.getByRole("slider", { name: t.video.position })).toBeDisabled();
  });
});
