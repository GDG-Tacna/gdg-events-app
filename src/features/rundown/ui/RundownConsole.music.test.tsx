// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import type { Track } from "../domain/music";
import type { MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, SavePlaylistAction, StageRunner } from "./actions";
import type { MusicPlayerProps, MusicWanted } from "./MusicPlayer";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, mp3, mp4 } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

// The sound itself is the player's job (tested on its own): here it is a stand-in that records what the console asks of it.
const player = vi.hoisted(() => ({ apply: vi.fn(), seek: vi.fn(), retry: vi.fn(), props: null as null | MusicPlayerProps }));
vi.mock("./MusicPlayer", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    MusicPlayer: (props: MusicPlayerProps) => {
      useImperativeHandle(props.handleRef, () => ({ apply: player.apply, seek: player.seek, retry: player.retry }), []);
      player.props = props;
      return null;
    },
  };
});

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

function setup(options: { playlist?: Track[]; savePlaylist?: SavePlaylistAction | null } = {}) {
  const lines = channelPair();
  const fake = fakeLibrary({ "musica/intro.mp3": mp3(), "musica/medio.mp3": mp3(), "musica/cierre.mp3": mp3(), "musica/otra.wav": mp3("otra.wav"), "apertura/video.mp4": mp4() });
  const savePlaylist = options.savePlaylist === null ? undefined : (options.savePlaylist ?? vi.fn<SavePlaylistAction>(async ({ tracks }) => ({ ok: true, tracks })));
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={[{ id: "keynote", time: "09:00", title: "Keynote", who: "Equipo GDG" }]}
      qrItems={["keynote"]}
      stored={{ keynote: [CLIP] }}
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
  /** What the console last asked the player. */
  const asked = () => player.apply.mock.calls.map((call) => call[0] as MusicWanted);
  return { asked, savePlaylist };
}

const panel = () => screen.getByRole("region", { name: m.title });
const inPanel = () => within(panel());
const click = async (name: string | RegExp) => {
  fireEvent.click(inPanel().getByRole("button", { name }));
  await settle();
};
const openList = () => click(/^Lista \(/);

beforeEach(() => {
  vi.clearAllMocks();
  player.props = null;
  window.open = vi.fn();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("the music line", () => {
  it("is not there without a way to save the playlist", async () => {
    setup({ savePlaylist: null });
    await settle();

    expect(screen.queryByRole("region", { name: m.title })).not.toBeInTheDocument();
    expect(player.props).toBeNull();
  });

  it("sits in one line of controls like the video's, and has the playlist closed under it", async () => {
    setup();
    await settle();

    for (const name of [m.previous, m.play, m.next, m.stop, m.repeat.all]) expect(inPanel().getByRole("button", { name })).toBeInTheDocument();
    for (const name of [m.position, m.volume]) expect(inPanel().getByRole("slider", { name })).toBeInTheDocument();
    expect(inPanel().getByRole("combobox", { name: m.fade })).toBeInTheDocument();
    expect(inPanel().getByRole("checkbox", { name: m.duck })).toBeInTheDocument();
    expect(inPanel().queryByRole("list", { name: m.list })).not.toBeInTheDocument();

    await openList();
    expect(inPanel().getByRole("list", { name: m.list })).toBeInTheDocument();
  });

  it("with no songs, offers adding them and has no playback controls", async () => {
    setup({ playlist: [] });
    await settle();

    expect(inPanel().queryByRole("button", { name: m.play })).not.toBeInTheDocument();
    await openList();
    expect(inPanel().getByText(m.empty)).toBeInTheDocument();
    expect(inPanel().getByRole("button", { name: m.add })).toBeInTheDocument();
  });

  it("plays a song from the list: it fades in as set, and the console shows it playing", async () => {
    const { asked } = setup();
    await settle();
    await openList();

    await click("Reproducir Medio");
    expect(asked().at(-1)).toEqual({ track: MEDIO, playing: true, volume: 0.8, fadeMs: 2000 });
    expect(inPanel().getByText(m.playing)).toBeInTheDocument();
    expect(inPanel().getByRole("button", { name: m.pause })).toBeInTheDocument();
  });

  it("pauses with a fade, and the first play starts from the first song", async () => {
    const { asked } = setup();
    await settle();

    await click(m.play);
    expect(asked().at(-1)).toMatchObject({ track: INTRO, playing: true });
    await click(m.pause);
    expect(asked().at(-1)).toMatchObject({ track: INTRO, playing: false, fadeMs: 2000 });
  });

  it("moves to the next and the previous song, and stops by unloading", async () => {
    const { asked } = setup();
    await settle();
    await openList();
    await click("Reproducir Intro");

    await click(m.next);
    expect(asked().at(-1)).toMatchObject({ track: MEDIO, playing: true });
    await click(m.previous);
    expect(asked().at(-1)).toMatchObject({ track: INTRO });
    await click(m.stop);
    expect(asked().at(-1)).toMatchObject({ track: null, playing: false });
    expect(inPanel().getByText(m.idle)).toBeInTheDocument();
  });

  it("changes the volume at once (no fade) and the length of the fade", async () => {
    const { asked } = setup();
    await settle();
    await click(m.play);

    fireEvent.change(inPanel().getByRole("slider", { name: m.volume }), { target: { value: "0.4" } });
    await settle();
    expect(asked().at(-1)).toMatchObject({ volume: 0.4, fadeMs: 0 });

    fireEvent.change(inPanel().getByRole("combobox", { name: m.fade }), { target: { value: "5" } });
    await click(m.pause);
    expect(asked().at(-1)).toMatchObject({ playing: false, fadeMs: 5000 });
    fireEvent.change(inPanel().getByRole("combobox", { name: m.fade }), { target: { value: "0" } });
    await click(m.play);
    expect(asked().at(-1)).toMatchObject({ playing: true, fadeMs: 0 });
  });

  it("goes through the repeat modes", async () => {
    setup();
    await settle();

    await click(m.repeat.all);
    expect(inPanel().getByRole("button", { name: m.repeat.one })).toBeInTheDocument();
    await click(m.repeat.one);
    expect(inPanel().getByRole("button", { name: m.repeat.off })).toBeInTheDocument();
  });

  it("goes on to the next song when one ends by itself, and stops at the end of a list that does not repeat", async () => {
    const { asked } = setup();
    await settle();
    await openList();
    await click("Reproducir Medio");

    await act(async () => player.props?.onProgress("song-0002", 10, 100));
    await act(async () => player.props?.onEnded("song-0002"));
    await settle();
    expect(asked().at(-1)).toMatchObject({ track: CIERRE, playing: true });

    await click(m.repeat.all);
    await click(m.repeat.one);
    await act(async () => player.props?.onProgress("song-0003", 10, 100));
    await act(async () => player.props?.onEnded("song-0003"));
    await settle();
    expect(asked().at(-1)).toMatchObject({ track: CIERRE, playing: false });
  });

  it("says a song could not be played when it ends without ever starting, and moves on without looping", async () => {
    const { asked } = setup();
    await settle();
    await openList();
    await click("Reproducir Medio");

    await act(async () => player.props?.onEnded("song-0002"));
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo reproducir «Medio»");
    expect(asked().at(-1)).toMatchObject({ track: CIERRE, playing: true });
  });

  it("ignores the end of a song that is not the loaded one", async () => {
    const { asked } = setup();
    await settle();
    await click(m.play);
    const count = asked().length;

    await act(async () => player.props?.onEnded("song-0003"));
    await settle();
    expect(asked().length).toBe(count);
  });

  it("shows the position the player reports and jumps when the bar moves", async () => {
    setup();
    await settle();
    await click(m.play);

    await act(async () => player.props?.onProgress("song-0001", 65, 185));
    expect(inPanel().getByText("1:05 de 3:05")).toBeInTheDocument();
    fireEvent.change(inPanel().getByRole("slider", { name: m.position }), { target: { value: "120" } });
    expect(player.seek).toHaveBeenCalledWith(120);
  });

  it("offers a button to unlock the sound when the browser holds it back, and asks the player to try again", async () => {
    setup();
    await settle();
    await click(m.play);

    await act(async () => player.props?.onBlocked(true));
    expect(inPanel().getByText(m.blocked)).toBeInTheDocument();
    await click(m.unlock);
    expect(player.retry).toHaveBeenCalledTimes(1);

    await act(async () => player.props?.onBlocked(false));
    expect(inPanel().queryByRole("button", { name: m.unlock })).not.toBeInTheDocument();
  });

  it("fades out of the way of a video, and comes back when it stops", async () => {
    const { asked } = setup();
    await settle();
    await click(m.play);
    expect(asked().at(-1)).toMatchObject({ playing: true });

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(asked().at(-1)).toMatchObject({ track: INTRO, playing: false, fadeMs: 2000 });
    expect(inPanel().getByText(m.ducked)).toBeInTheDocument();

    // The console's own «Detener» (the music has its own, inside its line).
    fireEvent.click(screen.getAllByRole("button", { name: t.transport.stop }).find((button) => !panel().contains(button)) as HTMLElement);
    await settle();
    expect(asked().at(-1)).toMatchObject({ track: INTRO, playing: true });
  });

  it("keeps playing under a video when the setting is off", async () => {
    const { asked } = setup();
    await settle();
    await click(m.play);
    fireEvent.click(inPanel().getByRole("checkbox", { name: m.duck }));
    const count = asked().length;

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(asked().at(-1)).toMatchObject({ playing: true });
    expect(asked().length).toBe(count);
  });
});

describe("editing the playlist", () => {
  it("adds songs from the folder (only audio is offered), marks them and saves their paths", async () => {
    const { savePlaylist } = setup({ playlist: [INTRO] });
    await settle();
    await openList();

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
    await openList();
    await click(m.add);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /musica\/otra\.wav/ }));
    await settle();

    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(m.saveFailed);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.dialog.done }));
    await settle();
    expect(inPanel().getByText("Lista (1)")).toBeInTheDocument();
  });

  it("moves and removes songs in edit mode, and the music lets go of the one that was playing", async () => {
    const { savePlaylist, asked } = setup();
    await settle();
    await openList();
    await click("Reproducir Medio");
    await click(m.edit);

    await click(`${m.moveUp}: Medio`);
    expect(savePlaylist).toHaveBeenLastCalledWith({ tracks: [MEDIO, INTRO, CIERRE] });

    await click(`${m.remove}: Medio`);
    expect(savePlaylist).toHaveBeenLastCalledWith({ tracks: [INTRO, CIERRE] });
    expect(asked().at(-1)).toMatchObject({ track: null, playing: false });
    expect(inPanel().queryByRole("button", { name: "Reproducir Medio" })).not.toBeInTheDocument();
  });
});
