// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { answerConfirm } from "@/test-utils/confirm";
import type { ChannelMessage } from "../domain/channel";
import type { LayerCard } from "../domain/layers";
import type { MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCardsAction, SaveCuesAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, png } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

const t = copy.stageConsole;
const l = t.layers;
const SPEAKER: LayerCard = { id: "card-0001", kind: "speaker", title: "Luis Eduardo", text: "Agente de IA con Genkit", link: "", x: 4, y: 94, hideAfter: null };
const NOTICE: LayerCard = { id: "card-0002", kind: "notice", title: "Almuerzo", text: "", link: "gdgtacna.com/menu", x: 98, y: 3, hideAfter: 5 };
const PHOTO: MediaCue = { id: "photo-1", kind: "image", name: "Portada", path: "apertura/portada.png" };
const PHOTO_2: MediaCue = { id: "photo-2", kind: "image", name: "Auspiciadores", path: "apertura/auspiciadores.png" };

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup(options: { cards?: LayerCard[]; saveCards?: SaveCardsAction | null } = {}) {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary({ "apertura/portada.png": png(), "apertura/auspiciadores.png": png("auspiciadores.png") });
  const saveCards = options.saveCards === null ? undefined : (options.saveCards ?? vi.fn<SaveCardsAction>(async ({ cards }) => ({ ok: true, cards })));
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={[{ id: "keynote", time: "09:00", title: "Keynote", who: "Equipo GDG" }]}
      qrItems={[]}
      stored={{ keynote: [PHOTO, PHOTO_2] }}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }))}
      cards={options.cards ?? [SPEAKER, NOTICE]}
      saveCards={saveCards}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
  const layers = () => heard.filter((message): message is Extract<ChannelMessage, { type: "layers" }> => message.type === "layers");
  return { layers, saveCards, stage: lines.stage };
}

const panel = () => screen.getByRole("region", { name: l.title });
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
afterEach(() => vi.useRealTimers());

describe("the counter", () => {
  it("is not there without a way to save the cards", async () => {
    setup({ saveCards: null });
    await settle();

    expect(screen.queryByRole("region", { name: l.title })).not.toBeInTheDocument();
  });

  it("shows on the screen when turned on, and goes away when turned off", async () => {
    const { layers } = setup();
    await settle();
    expect(layers().at(-1)?.counter).toMatchObject({ visible: false, remainingMs: 300_000 });

    await click(l.show);
    expect(layers().at(-1)?.counter).toMatchObject({ visible: true, running: false, x: 98, y: 3, size: "sm" });
    expect(inPanel().getByText(l.onScreen, { selector: "span" })).toBeInTheDocument();
    await click(l.hide);
    expect(layers().at(-1)?.counter.visible).toBe(false);
  });

  it("starts, counts down, pauses where it is, adds a minute and starts over", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(1_700_000_000_000);
    const { layers } = setup();
    await settle();

    await click(l.start);
    expect(layers().at(-1)?.counter).toMatchObject({ running: true, remainingMs: 300_000 });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(inPanel().getAllByText("04:50").length).toBeGreaterThan(0);

    await click(l.pause);
    expect(layers().at(-1)?.counter).toMatchObject({ running: false, remainingMs: 290_000 });
    await click(l.addMinute);
    expect(layers().at(-1)?.counter.remainingMs).toBe(350_000);
    await click(l.reset);
    expect(layers().at(-1)?.counter).toMatchObject({ running: false, remainingMs: 300_000 });
  });

  it("sets the time from what is typed, and says so when it is not a time", async () => {
    const { layers } = setup();
    await settle();

    const field = inPanel().getByRole("textbox", { name: l.duration });
    fireEvent.change(field, { target: { value: "02:30" } });
    fireEvent.blur(field);
    await settle();
    expect(layers().at(-1)?.counter.remainingMs).toBe(150_000);
    expect(field).toHaveValue("02:30");

    fireEvent.change(field, { target: { value: "dos" } });
    fireEvent.blur(field);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(l.badTime);
    expect(layers().at(-1)?.counter.remainingMs).toBe(150_000);
  });

  it("changes its size, goes to a named place and carries its text", async () => {
    const { layers } = setup();
    await settle();

    fireEvent.change(inPanel().getByRole("combobox", { name: l.size }), { target: { value: "lg" } });
    fireEvent.change(inPanel().getByRole("combobox", { name: l.place }), { target: { value: "bottomLeft" } });
    fireEvent.change(inPanel().getByRole("textbox", { name: l.label }), { target: { value: "Empezamos en" } });
    await settle();
    expect(layers().at(-1)?.counter).toMatchObject({ size: "lg", x: 2, y: 94, label: "Empezamos en" });
  });

  it("stops at 00:00, and takes the next piece by itself when it is set to", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(1_700_000_000_000);
    const { layers } = setup();
    await settle();
    fireEvent.change(inPanel().getByRole("textbox", { name: l.duration }), { target: { value: "00:02" } });
    fireEvent.blur(inPanel().getByRole("textbox", { name: l.duration }));
    fireEvent.change(inPanel().getByRole("combobox", { name: l.onZero }), { target: { value: "next" } });
    await settle();
    await click(l.start);

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    await settle();
    expect(layers().at(-1)?.counter).toMatchObject({ running: false, remainingMs: 0 });
    // «Pasar a lo siguiente» took the piece that was waiting.
    expect(screen.getAllByText("Portada").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: t.program.label })).toHaveTextContent("Portada");
  });

  it("is sent again when the screen connects, so a window opened late shows it", async () => {
    const { layers, stage } = setup();
    await settle();
    await click(l.show);
    const count = layers().length;

    await act(async () => stage.post({ type: "alive", showing: null }));
    await settle();
    expect(layers().length).toBeGreaterThan(count);
    expect(layers().at(-1)?.counter.visible).toBe(true);
  });
});

describe("the cards", () => {
  it("lists them, shows one on the screen and takes it off", async () => {
    const { layers } = setup();
    await settle();

    expect(inPanel().getByText("Luis Eduardo")).toBeInTheDocument();
    await click(`Mostrar la tarjeta Luis Eduardo`);
    expect(layers().at(-1)?.cards).toEqual([{ id: "card-0001", kind: "speaker", title: "Luis Eduardo", text: "Agente de IA con Genkit", link: "", x: 4, y: 94 }]);
    expect(inPanel().getByRole("button", { name: "Quitar de la pantalla la tarjeta Luis Eduardo" })).toHaveAttribute("aria-pressed", "true");

    await click("Quitar de la pantalla la tarjeta Luis Eduardo");
    expect(layers().at(-1)?.cards).toEqual([]);
  });

  it("takes a card off by itself after its seconds", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    const { layers } = setup();
    await settle();

    await click("Mostrar la tarjeta Almuerzo");
    expect(layers().at(-1)?.cards.map((card) => card.id)).toEqual(["card-0002"]);
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    await settle();
    expect(layers().at(-1)?.cards).toEqual([]);
  });

  it("creates a card of each kind in its usual place, saved with the others", async () => {
    const { saveCards } = setup({ cards: [] });
    await settle();
    expect(inPanel().getByText(l.noCards)).toBeInTheDocument();

    await click(l.newCard);
    let dialog = screen.getByRole("dialog", { name: l.cardDialog.newTitle });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.titleSpeaker), { target: { value: "Luis Eduardo" } });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.textSpeaker), { target: { value: "Genkit" } });
    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    await settle();
    expect(saveCards).toHaveBeenLastCalledWith({ cards: [{ id: expect.any(String), kind: "speaker", title: "Luis Eduardo", text: "Genkit", link: "", hideAfter: null, x: 2, y: 94 }] });

    await click(l.newCard);
    dialog = screen.getByRole("dialog", { name: l.cardDialog.newTitle });
    fireEvent.click(within(dialog).getByRole("radio", { name: l.cardDialog.kinds.notice }));
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.titleNotice), { target: { value: "Almuerzo" } });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.hideAfter), { target: { value: "8" } });
    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    await settle();
    expect(vi.mocked(saveCards!).mock.calls.at(-1)![0].cards.at(-1)).toMatchObject({ kind: "notice", title: "Almuerzo", hideAfter: 8, x: 98, y: 3 });
  });

  it("asks for a title and valid seconds, and saves nothing until they are right", async () => {
    const { saveCards } = setup({ cards: [] });
    await settle();
    await click(l.newCard);
    const dialog = screen.getByRole("dialog", { name: l.cardDialog.newTitle });

    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(l.cardDialog.errors.title);
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.titleSpeaker), { target: { value: "Luis" } });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.hideAfter), { target: { value: "900" } });
    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(l.cardDialog.errors.seconds);
    expect(saveCards).not.toHaveBeenCalled();
  });

  it("edits a card without moving it, and the screen shows the new text at once", async () => {
    const { saveCards, layers } = setup();
    await settle();
    await click("Mostrar la tarjeta Luis Eduardo");

    await click("Editar la tarjeta Luis Eduardo");
    const dialog = screen.getByRole("dialog", { name: l.cardDialog.editTitle });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.titleSpeaker), { target: { value: "Luis E. Fuentes" } });
    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    await settle();

    expect(saveCards).toHaveBeenLastCalledWith({ cards: [expect.objectContaining({ id: "card-0001", title: "Luis E. Fuentes", x: 4, y: 94 }), NOTICE] });
    expect(layers().at(-1)?.cards[0]).toMatchObject({ title: "Luis E. Fuentes" });
  });

  it("goes back and says so when the cards cannot be saved", async () => {
    setup({ saveCards: vi.fn<SaveCardsAction>(async () => ({ ok: false, code: "unknown" })) });
    await settle();
    await click(l.newCard);
    const dialog = screen.getByRole("dialog", { name: l.cardDialog.newTitle });
    fireEvent.change(within(dialog).getByLabelText(l.cardDialog.titleSpeaker), { target: { value: "Luis" } });
    fireEvent.click(within(dialog).getByRole("button", { name: l.cardDialog.save }));
    await settle();

    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(l.saveFailed);
  });

  it("removes a card after asking, and takes it off the screen first", async () => {
    const { saveCards, layers } = setup();
    await settle();
    await click("Mostrar la tarjeta Luis Eduardo");

    await click("Borrar la tarjeta Luis Eduardo");
    await answerConfirm("cancel");
    await settle();
    expect(saveCards).not.toHaveBeenCalled();

    await click("Borrar la tarjeta Luis Eduardo");
    await answerConfirm("confirm");
    await settle();
    expect(saveCards).toHaveBeenCalledWith({ cards: [NOTICE] });
    expect(layers().at(-1)?.cards).toEqual([]);
    expect(inPanel().queryByText("Luis Eduardo")).not.toBeInTheDocument();
  });
});

describe("moving the layers over the monitor", () => {
  it("offers a frame for the counter and each card shown, and moving one moves it on the screen (a card is saved where it lands)", async () => {
    const { layers, saveCards } = setup();
    await settle();
    expect(screen.queryByRole("button", { name: l.moveCounter })).not.toBeInTheDocument();

    await click(l.show);
    await click("Mostrar la tarjeta Luis Eduardo");
    const counterFrame = screen.getByRole("button", { name: l.moveCounter });
    fireEvent.keyDown(counterFrame, { key: "ArrowLeft", shiftKey: true });
    await settle();
    expect(layers().at(-1)?.counter).toMatchObject({ x: 88, y: 3 });

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover la tarjeta Luis Eduardo" }), { key: "ArrowUp" });
    await settle();
    expect(layers().at(-1)?.cards[0]).toMatchObject({ x: 4, y: 92 });
    expect(saveCards).toHaveBeenLastCalledWith({ cards: [expect.objectContaining({ id: "card-0001", x: 4, y: 92 }), NOTICE] });
  });
});
