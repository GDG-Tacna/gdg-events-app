// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { ok } from "@/shared/lib/result";
import type { ChannelMessage } from "../domain/channel";
import type { MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, StageRunner } from "./actions";
import { RundownConsole, type RundownConsoleProps } from "./RundownConsole";
import { channelPair, fakeLibrary, mp4, pdf, png } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
// The deck is drawn by pdf.js, which needs a real browser.
vi.mock("./SlideCanvas", () => ({
  SlideCanvas: ({ page, label }: { page: number; label: string }) => (
    <div data-testid="slide" data-page={page}>
      {label}
    </div>
  ),
}));

const t = copy.stageConsole;
const DECK: MediaCue = { id: "deck-1", kind: "slides", name: "Diapositivas del keynote", path: "apertura/keynote.pdf" };
const CLIP: MediaCue = { id: "clip-1", kind: "video", name: "Video de apertura", path: "apertura/video.mp4" };
const GENKIT: MediaCue = { id: "deck-2", kind: "slides", name: "Diapositivas de Genkit", path: "genkit/agente.pdf" };
const AGENDA = [
  { id: "keynote", time: "09:00", title: "Keynote de apertura", who: "Equipo GDG Tacna" },
  { id: "genkit", time: "09:15", title: "Agente de IA con Genkit", who: "Luis Eduardo" },
];

/** Gives the promises of a click (reading a file, running an action) time to finish. */
const settle = () =>
  act(async () => {
    for (let round = 0; round < 6; round += 1) await Promise.resolve();
  });

function setup(overrides: Partial<RundownConsoleProps> = {}, files: Record<string, File> = { "apertura/keynote.pdf": pdf(), "apertura/video.mp4": mp4(), "genkit/agente.pdf": pdf("agente.pdf"), "portada.png": png() }, status: "none" | "ready" | "needs-permission" = "ready") {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary(files, status);
  const saveCues = vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }));
  const runStage = vi.fn<StageRunner>(async () => ({ ok: true }));
  const projectTalk = vi.fn<ProjectTalkRunner>(async () => ({ ok: true }));
  const view = render(
    <RundownConsole
      edition="devfest-2026"
      agenda={AGENDA}
      qrItems={["keynote", "genkit"]}
      stored={{ keynote: [DECK, CLIP], genkit: [GENKIT] }}
      frozen={false}
      view="both"
      squadsOn
      polls={[{ id: "encuesta-1", status: "open" }]}
      saveCues={saveCues}
      runStage={runStage}
      projectTalk={projectTalk}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
      {...overrides}
    />,
  );
  /** What the projector's window says to the console. */
  const stageSays = (message: ChannelMessage) => act(async () => lines.stage.post(message));
  const programs = () => heard.filter((message): message is Extract<ChannelMessage, { type: "program" }> => message.type === "program");
  return { view, heard, programs, stageSays, saveCues, runStage, projectTalk, fake };
}

const take = () => fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
const monitor = (label: string) => within(screen.getByRole("region", { name: label }));
/** A quick-scene button: looked up inside the deck, where the order has pieces with the same names. */
const deckKey = (label: string) => within(screen.getByRole("region", { name: t.deck.title })).getByRole("button", { name: new RegExp(label) });

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
});

describe("RundownConsole", () => {
  it("shows the order of the event: each point of the agenda with its pieces, the first one waiting", async () => {
    setup();
    await settle();

    const order = screen.getByRole("region", { name: t.rundown.title });
    expect(within(order).getByText("Keynote de apertura")).toBeInTheDocument();
    expect(within(order).getByText("Agente de IA con Genkit")).toBeInTheDocument();
    // The first point is open, with its files in order and its QR last.
    expect(within(order).getAllByText(/Diapositivas del keynote|Video de apertura|QR de la charla/).map((node) => node.textContent)).toEqual(["Diapositivas del keynote", "Video de apertura", "QR de la charla"]);
    expect(within(order).getByText("apertura/keynote.pdf")).toBeInTheDocument();
    expect(within(order).getByText(t.rundown.next)).toBeInTheDocument();
    expect(monitor(t.program.next).getAllByText("Diapositivas del keynote").length).toBeGreaterThan(0);
    expect(monitor(t.program.label).getAllByText(t.program.nothing).length).toBeGreaterThan(0);
  });

  it("takes the waiting piece onto the air, tells the projector's window, and the next one waits", async () => {
    const { programs } = setup();
    await settle();

    take();
    await settle();

    expect(programs().at(-1)).toMatchObject({ type: "program", cue: { id: "deck-1", kind: "slides", path: "apertura/keynote.pdf" }, slide: 1 });
    expect(monitor(t.program.label).getAllByText("Diapositivas del keynote").length).toBeGreaterThan(0);
    expect(monitor(t.program.next).getAllByText("Video de apertura").length).toBeGreaterThan(0);
  });

  it("moves through the slides once the projector says how many there are, and takes the next piece after the last", async () => {
    const { programs, heard, stageSays } = setup();
    await settle();
    take();
    await settle();

    await stageSays({ type: "loaded", cueId: "deck-1", slides: 3 });
    expect(screen.getByRole("button", { name: "Ir a la lámina 3" })).toBeInTheDocument();
    expect(monitor(t.program.label).getByText("Lámina 1 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.transport.forward }));
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 2, playing: false });
    expect(screen.getByTestId("slide")).toHaveAttribute("data-page", "2");

    fireEvent.click(screen.getByRole("button", { name: "Ir a la lámina 3" }));
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 3, playing: false });

    // On the last slide the next press takes the waiting piece: the video, playing.
    fireEvent.click(screen.getByRole("button", { name: t.transport.forward }));
    await settle();
    expect(programs().at(-1)).toMatchObject({ cue: { id: "clip-1", kind: "video" }, playing: true });
  });

  it("goes back a slide, and plays or pauses a video", async () => {
    const { heard, stageSays } = setup();
    await settle();
    take();
    await settle();
    await stageSays({ type: "loaded", cueId: "deck-1", slides: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Ir a la lámina 3" }));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.transport.back }));
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 2, playing: false });

    take();
    await settle();
    expect(screen.getByRole("button", { name: t.transport.pause })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.transport.pause }));
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 1, playing: false });
    expect(screen.getByRole("button", { name: t.transport.play })).toBeInTheDocument();
  });

  it("lets the operator pick what goes next, and takes that one", async () => {
    const { programs } = setup();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /Video de apertura/ }));
    take();
    await settle();

    expect(programs().at(-1)?.cue?.id).toBe("clip-1");
  });

  it("puts a data scene on the stage and clears the projector's window of files", async () => {
    const { runStage, programs } = setup();
    await settle();
    take();
    await settle();

    fireEvent.click(deckKey(t.deck.keys.ranking.label));
    await settle();

    expect(runStage).toHaveBeenCalledWith({ type: "show", display: "ranking" });
    expect(programs().at(-1)).toMatchObject({ cue: null });
    expect(monitor(t.program.label).getAllByText(t.program.scenes.ranking).length).toBeGreaterThan(0);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("asks for a second press before showing the winners, and for none on the other scenes", async () => {
    const { runStage } = setup();
    await settle();

    const winners = deckKey(t.deck.keys.reveal.label);
    fireEvent.click(winners);
    await settle();
    expect(runStage).not.toHaveBeenCalled();
    expect(within(winners).getByText(t.deck.confirm)).toBeInTheDocument();

    fireEvent.click(winners);
    await settle();
    expect(runStage).toHaveBeenCalledWith({ type: "reveal" });
  });

  it("shows the open poll, the waiting screen and the QR of the talk, each through its own action", async () => {
    const { runStage, projectTalk } = setup();
    await settle();

    fireEvent.click(deckKey(t.deck.keys.poll.label));
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "poll", pollId: "encuesta-1" });

    fireEvent.click(deckKey(t.deck.keys.waiting.label));
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "show", display: "waiting" });

    fireEvent.click(deckKey(t.deck.keys.qr.label));
    await settle();
    // Nothing is on the air from a point yet: the QR is the one of the point that waits (the first).
    expect(projectTalk).toHaveBeenCalledWith({ id: "keynote" });
  });

  it("freezes and unfreezes the ranking, and cycles the view", async () => {
    const { runStage } = setup();
    await settle();

    fireEvent.click(deckKey(t.deck.keys.freeze.label));
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "freeze" });
    fireEvent.click(deckKey(t.deck.keys.unfreeze.label));
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "unfreeze" });

    fireEvent.click(deckKey(t.deck.keys.view.label));
    await settle();
    // From both, the view goes round to cadets.
    expect(runStage).toHaveBeenLastCalledWith({ type: "view", view: "cadets" });
  });

  it("opens the raffle in another tab, and disables the scenes that have nothing to show", async () => {
    setup({ polls: [], squadsOn: false, qrItems: [] });
    await settle();

    fireEvent.click(deckKey(t.deck.keys.raffle.label));
    expect(window.open).toHaveBeenCalledWith("/admin/sorteo", "_blank", "noopener");
    expect(deckKey(t.deck.keys.poll.label)).toBeDisabled();
    expect(deckKey(t.deck.keys.view.label)).toBeDisabled();
    expect(deckKey(t.deck.keys.qr.label)).toBeDisabled();
  });

  it("says when the screen is connected, and when it stops answering", async () => {
    const { stageSays } = setup();
    await settle();
    expect(screen.getByText(t.screenOff)).toBeInTheDocument();

    await stageSays({ type: "alive", showing: null });
    expect(screen.getByText(t.screenOn)).toBeInTheDocument();
  });

  it("sends again what is on the air to a projector window that opens later", async () => {
    const { programs, stageSays } = setup();
    await settle();
    take();
    await settle();
    const before = programs().length;

    await stageSays({ type: "alive", showing: null });
    await settle();

    expect(programs().length).toBe(before + 1);
    expect(programs().at(-1)?.cue?.id).toBe("deck-1");
  });

  it("marks the pieces whose file is not in the folder, and those the projector could not read", async () => {
    const { stageSays } = setup({}, { "apertura/keynote.pdf": pdf() });
    await settle();

    // The video and the genkit deck are not in this folder.
    expect(screen.getAllByText(t.rundown.missing)).toHaveLength(1);

    await stageSays({ type: "failed", cueId: "deck-1", reason: "missing" });
    expect(screen.getAllByText(t.rundown.missing)).toHaveLength(2);
  });

  it("adds a file from the connected folder to the open point, saving only its path", async () => {
    const { saveCues } = setup();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "portada.png" }));
    await settle();

    expect(saveCues).toHaveBeenCalledTimes(1);
    const saved = saveCues.mock.calls[0][0];
    expect(saved.itemId).toBe("keynote");
    expect(saved.cues.map((cue) => ("path" in cue ? cue.path : cue.id))).toEqual(["apertura/keynote.pdf", "apertura/video.mp4", "portada.png"]);
    expect(saved.cues.at(-1)).toMatchObject({ kind: "image", name: "portada" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("portada.png")).toBeInTheDocument();
  });

  it("refuses a typed path that cannot be shown, and keeps the dialog open", async () => {
    const { saveCues } = setup();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.picker.pathLabel), { target: { value: "../fuera.pdf" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.picker.add }));
    await settle();

    expect(saveCues).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.picker.badPath);
  });

  it("puts the order back and says so when saving fails", async () => {
    const failing = vi.fn<SaveCuesAction>(async () => ({ ok: false, code: "unknown" }));
    setup({ saveCues: failing });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "portada.png" }));
    await settle();

    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain(t.alerts.saveFailed);
    // The order keeps what it had (the file picker, still open, lists the folder).
    expect(within(screen.getByRole("region", { name: t.rundown.title, hidden: true })).queryByText("portada.png")).not.toBeInTheDocument();
  });

  it("removes and moves pieces in edit mode", async () => {
    const { saveCues } = setup();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.edit }));
    fireEvent.click(screen.getByRole("button", { name: `${t.rundown.moveDown}: Diapositivas del keynote` }));
    await settle();
    expect(saveCues.mock.calls.at(-1)?.[0].cues.map((cue) => cue.id)).toEqual(["clip-1", "deck-1"]);

    fireEvent.click(screen.getByRole("button", { name: `${t.rundown.remove}: Video de apertura` }));
    await settle();
    expect(saveCues.mock.calls.at(-1)?.[0].cues.map((cue) => cue.id)).toEqual(["deck-1"]);
  });

  it("works from the keyboard: Enter takes, the arrows move through the slides, Space plays, Escape waits", async () => {
    const { heard, programs, stageSays, runStage } = setup();
    await settle();

    fireEvent.keyDown(window, { key: "Enter" });
    await settle();
    expect(programs().at(-1)?.cue?.id).toBe("deck-1");

    await stageSays({ type: "loaded", cueId: "deck-1", slides: 5 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 2, playing: false });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 1, playing: false });
    fireEvent.keyDown(window, { key: "4" });
    await settle();
    expect(heard.at(-1)).toEqual({ type: "transport", slide: 4, playing: false });

    fireEvent.keyDown(window, { key: "F1" });
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "show", display: "ranking" });
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(runStage).toHaveBeenLastCalledWith({ type: "show", display: "waiting" });
  });

  it("leaves the keys alone while a dialog is open or a field has the focus", async () => {
    const { programs } = setup();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();

    fireEvent.keyDown(within(screen.getByRole("dialog")).getByLabelText(t.picker.search), { key: "Enter" });
    await settle();

    expect(programs()).toHaveLength(0);
  });

  it("asks to connect the folder the first time, and says when the browser took the permission back", async () => {
    const first = setup({}, {}, "none");
    await settle();
    expect(screen.getByRole("dialog", { name: t.setup.title })).toBeInTheDocument();
    first.view.unmount();

    setup({}, {}, "needs-permission");
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(t.alerts.permission);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ok(undefined).ok).toBe(true);
  });
});
