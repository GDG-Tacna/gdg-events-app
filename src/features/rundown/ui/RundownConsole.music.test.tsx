// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { ChannelMessage } from "../domain/channel";
import type { Track } from "../domain/music";
import type { MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, SavePlaylistAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, mp3, mp4 } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

const t = copy.stageConsole;
const m = t.music;
const INTRO: Track = { id: "song-0001", name: "Intro", path: "musica/intro.mp3" };
const MEDIO: Track = { id: "song-0002", name: "Medio", path: "musica/medio.mp3" };
const CIERRE: Track = { id: "song-0003", name: "Cierre", path: "musica/cierre.mp3" };
const CLIP: MediaCue = { id: "clip-1", kind: "video", name: "Video de apertura", path: "apertura/video.mp4" };

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup(options: { playlist?: Track[]; savePlaylist?: SavePlaylistAction | null; stored?: Record<string, MediaCue[]> } = {}) {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary({ "musica/intro.mp3": mp3(), "musica/medio.mp3": mp3(), "musica/cierre.mp3": mp3(), "musica/otra.wav": mp3("otra.wav"), "apertura/video.mp4": mp4() });
  const savePlaylist = options.savePlaylist === null ? undefined : (options.savePlaylist ?? vi.fn<SavePlaylistAction>(async ({ tracks }) => ({ ok: true, tracks })));
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={[{ id: "keynote", time: "09:00", title: "Keynote", who: "Equipo GDG" }]}
      qrItems={["keynote"]}
      stored={options.stored ?? { keynote: [CLIP] }}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }))}
      playlist={options.playlist ?? [INTRO, MEDIO, CIERRE]}
      savePlaylist={savePlaylist}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
  const musics = () => heard.filter((message): message is Extract<ChannelMessage, { type: "music" }> => message.type === "music");
  return { heard, musics, savePlaylist, stage: lines.stage };
}

const panel = () => screen.getByRole("region", { name: m.title });
const inPanel = () => within(panel());
const click = async (name: string | RegExp) => {
  fireEvent.click(inPanel().getByRole("button", { name }));
  await settle();
};

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("the music panel", () => {
  it("is not there without a way to save the playlist, and says it is empty when it has no songs", async () => {
    const { rerender } = { rerender: null };
    void rerender;
    setup({ savePlaylist: null });
    await settle();
    expect(screen.queryByRole("region", { name: m.title })).not.toBeInTheDocument();
  });

  it("invites adding songs when the playlist is empty", async () => {
    setup({ playlist: [] });
    await settle();

    expect(inPanel().getByText(m.empty)).toBeInTheDocument();
    expect(inPanel().getByText("0 canciones")).toBeInTheDocument();
    expect(inPanel().queryByRole("button", { name: m.play })).not.toBeInTheDocument();
  });

  it("plays a song from the list: it fades in as set, and the console shows it playing", async () => {
    const { musics } = setup();
    await settle();

    await click("Reproducir Medio");
    expect(musics().at(-1)).toEqual({ type: "music", track: MEDIO, playing: true, volume: 0.8, fadeMs: 2000 });
    expect(inPanel().getByText(m.playing)).toBeInTheDocument();
    expect(inPanel().getByRole("button", { name: m.pause })).toBeInTheDocument();
  });

  it("pauses with a fade, and the first play starts from the first song", async () => {
    const { musics } = setup();
    await settle();

    await click(m.play);
    expect(musics().at(-1)).toMatchObject({ track: INTRO, playing: true });
    await click(m.pause);
    expect(musics().at(-1)).toMatchObject({ track: INTRO, playing: false, fadeMs: 2000 });
  });

  it("moves to the next and the previous song, and stops by unloading", async () => {
    const { musics } = setup();
    await settle();
    await click("Reproducir Intro");

    await click(m.next);
    expect(musics().at(-1)).toMatchObject({ track: MEDIO, playing: true });
    await click(m.previous);
    expect(musics().at(-1)).toMatchObject({ track: INTRO });
    await click(m.stop);
    expect(musics().at(-1)).toMatchObject({ track: null, playing: false });
    expect(inPanel().getByText(m.nothing)).toBeInTheDocument();
    expect(inPanel().getByText(m.idle)).toBeInTheDocument();
  });

  it("changes the volume at once (no fade) and the length of the fade", async () => {
    const { musics } = setup();
    await settle();
    await click("Reproducir Intro");

    fireEvent.change(inPanel().getByRole("slider", { name: m.volume }), { target: { value: "0.4" } });
    await settle();
    expect(musics().at(-1)).toMatchObject({ volume: 0.4, fadeMs: 0 });

    fireEvent.change(inPanel().getByRole("combobox", { name: m.fade }), { target: { value: "5" } });
    await click(m.pause);
    expect(musics().at(-1)).toMatchObject({ playing: false, fadeMs: 5000 });
    fireEvent.change(inPanel().getByRole("combobox", { name: m.fade }), { target: { value: "0" } });
    await click(m.play);
    expect(musics().at(-1)).toMatchObject({ playing: true, fadeMs: 0 });
  });

  it("goes through the repeat modes", async () => {
    setup();
    await settle();

    expect(inPanel().getByRole("button", { name: m.repeat.all })).toBeInTheDocument();
    await click(m.repeat.all);
    expect(inPanel().getByRole("button", { name: m.repeat.one })).toBeInTheDocument();
    await click(m.repeat.one);
    expect(inPanel().getByRole("button", { name: m.repeat.off })).toBeInTheDocument();
  });

  it("goes on to the next song when one ends by itself, and stops at the end of a list that does not repeat", async () => {
    const { musics, stage } = setup();
    await settle();
    await click("Reproducir Medio");

    await act(async () => stage.post({ type: "musicProgress", trackId: "song-0002", time: 10, duration: 100 }));
    await act(async () => stage.post({ type: "musicEnded", trackId: "song-0002" }));
    await settle();
    expect(musics().at(-1)).toMatchObject({ track: CIERRE, playing: true });

    await click(m.repeat.all);
    await click(m.repeat.one);
    await act(async () => stage.post({ type: "musicProgress", trackId: "song-0003", time: 10, duration: 100 }));
    await act(async () => stage.post({ type: "musicEnded", trackId: "song-0003" }));
    await settle();
    expect(musics().at(-1)).toMatchObject({ track: CIERRE, playing: false });
  });

  it("says a song could not be played when it ends without ever starting, and moves on without looping", async () => {
    const { musics, stage } = setup();
    await settle();
    await click("Reproducir Medio");

    await act(async () => stage.post({ type: "musicEnded", trackId: "song-0002" }));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo reproducir «Medio»");
    expect(musics().at(-1)).toMatchObject({ track: CIERRE, playing: true });
  });

  it("shows the position the projector's window reports and jumps when the bar moves", async () => {
    const { heard, stage } = setup();
    await settle();
    await click("Reproducir Intro");

    await act(async () => stage.post({ type: "musicProgress", trackId: "song-0001", time: 65, duration: 185 }));
    expect(inPanel().getByText("1:05 de 3:05")).toBeInTheDocument();
    fireEvent.change(inPanel().getByRole("slider", { name: m.position }), { target: { value: "120" } });
    expect(heard.at(-1)).toEqual({ type: "musicSeek", seconds: 120 });
  });

  it("tells the person when the screen needs a click to make sound", async () => {
    const { stage } = setup();
    await settle();
    await click("Reproducir Intro");

    await act(async () => stage.post({ type: "musicBlocked", blocked: true }));
    expect(inPanel().getByRole("alert")).toHaveTextContent(m.blocked);
    await act(async () => stage.post({ type: "musicBlocked", blocked: false }));
    expect(inPanel().queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fades out of the way of a video, and comes back when it stops", async () => {
    const { musics } = setup();
    await settle();
    await click("Reproducir Intro");
    expect(musics().at(-1)).toMatchObject({ playing: true });

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(musics().at(-1)).toMatchObject({ track: INTRO, playing: false, fadeMs: 2000 });
    expect(inPanel().getByText(m.ducked)).toBeInTheDocument();

    // The console's own «Detener» (the music has its own, inside its panel).
    fireEvent.click(screen.getAllByRole("button", { name: t.transport.stop }).find((button) => !panel().contains(button)) as HTMLElement);
    await settle();
    expect(musics().at(-1)).toMatchObject({ track: INTRO, playing: true });
  });

  it("keeps playing under a video when the setting is off", async () => {
    const { musics } = setup();
    await settle();
    await click("Reproducir Intro");
    fireEvent.click(inPanel().getByRole("checkbox", { name: m.duck }));
    const count = musics().length;

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(musics().at(-1)).toMatchObject({ playing: true });
    expect(musics().length).toBe(count);
  });

  it("tells a projector's window that opens late what should be playing", async () => {
    const { musics, stage } = setup();
    await settle();
    await click("Reproducir Medio");
    const count = musics().length;

    await act(async () => stage.post({ type: "musicAlive", trackId: "song-0002" }));
    await settle();
    expect(musics().length).toBe(count);

    await act(async () => stage.post({ type: "musicAlive", trackId: null }));
    await settle();
    expect(musics().length).toBe(count + 1);
    expect(musics().at(-1)).toMatchObject({ track: MEDIO, playing: true, fadeMs: 0 });
  });
});

describe("editing the playlist", () => {
  it("adds songs from the folder (only audio is offered), marks them and saves their paths", async () => {
    const { savePlaylist } = setup({ playlist: [INTRO] });
    await settle();

    await click(m.add);
    const dialog = screen.getByRole("dialog", { name: m.dialog.title });
    expect(within(dialog).queryByText("apertura/video.mp4")).not.toBeInTheDocument();
    expect(within(dialog).getByText("musica/intro.mp3").parentElement).toHaveTextContent(m.dialog.added);

    fireEvent.click(within(dialog).getByRole("button", { name: /musica\/otra\.wav/ }));
    await settle();
    expect(savePlaylist).toHaveBeenCalledWith({ tracks: [INTRO, { id: expect.any(String), name: "otra", path: "musica/otra.wav" }] });
    expect(within(dialog).getByRole("button", { name: /musica\/otra\.wav/ })).toHaveTextContent(m.dialog.added);
    // The dialog stays open to add more.
    expect(screen.getByRole("dialog", { name: m.dialog.title })).toBeInTheDocument();
  });

  it("goes back and says so when the playlist cannot be saved", async () => {
    setup({ playlist: [INTRO], savePlaylist: vi.fn<SavePlaylistAction>(async () => ({ ok: false, code: "unknown" })) });
    await settle();
    await click(m.add);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /musica\/otra\.wav/ }));
    await settle();

    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(m.saveFailed);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.dialog.done }));
    await settle();
    expect(inPanel().getByText("1 canciones")).toBeInTheDocument();
  });

  it("moves and removes songs in edit mode, and the music lets go of the one that was playing", async () => {
    const { savePlaylist, musics } = setup();
    await settle();
    await click("Reproducir Medio");
    await click(m.edit);

    await click(`${m.moveUp}: Medio`);
    expect(savePlaylist).toHaveBeenLastCalledWith({ tracks: [MEDIO, INTRO, CIERRE] });

    await click(`${m.remove}: Medio`);
    expect(savePlaylist).toHaveBeenLastCalledWith({ tracks: [INTRO, CIERRE] });
    expect(musics().at(-1)).toMatchObject({ track: null, playing: false });
    expect(inPanel().queryByRole("button", { name: "Reproducir Medio" })).not.toBeInTheDocument();
  });
});
