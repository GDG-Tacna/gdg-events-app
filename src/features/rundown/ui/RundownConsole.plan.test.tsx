// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { answerConfirm } from "@/test-utils/confirm";
import type { ChannelMessage } from "../domain/channel";
import type { AgendaPoint, MediaCue, StoredCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, SaveMinutesAction, SavePointsAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, png } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

const t = copy.stageConsole;
const AGENDA: AgendaPoint[] = [
  { id: "keynote", time: "09:00", title: "Keynote de apertura", who: "Equipo GDG Tacna" },
  { id: "genkit", time: "11:00", title: "Agente de IA con Genkit", who: "Luis Eduardo" },
];
const CAFE: AgendaPoint = { id: "cafe-ab12", time: "10:40", title: "Café", who: "", custom: true, minutes: 15 };
const PHOTO: MediaCue = { id: "photo-1", kind: "image", name: "Portada", path: "apertura/portada.png" };
const PHOTO_2: MediaCue = { id: "photo-2", kind: "image", name: "Auspiciadores", path: "apertura/auspiciadores.png" };

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup(options: { agenda?: AgendaPoint[]; stored?: Record<string, readonly StoredCue[]>; savePoints?: SavePointsAction; saveMinutes?: SaveMinutesAction } = {}) {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary({ "apertura/portada.png": png(), "apertura/auspiciadores.png": png() });
  const saveCues = vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }));
  const savePoints = options.savePoints ?? vi.fn<SavePointsAction>(async ({ points }) => ({ ok: true, points }));
  const saveMinutes = options.saveMinutes ?? vi.fn<SaveMinutesAction>(async () => ({ ok: true }));
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={options.agenda ?? AGENDA}
      qrItems={["keynote", "genkit"]}
      stored={options.stored ?? { keynote: [PHOTO] }}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={saveCues}
      savePoints={savePoints}
      saveMinutes={saveMinutes}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
  return { heard, saveCues, savePoints, saveMinutes };
}

const startEditing = async () => {
  fireEvent.click(screen.getByRole("button", { name: t.rundown.edit }));
  await settle();
};
const titles = () => screen.getAllByRole("button", { name: /^Mostrar las piezas de/, hidden: true }).map((button) => button.getAttribute("aria-label")?.replace("Mostrar las piezas de ", ""));

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => vi.useRealTimers());

describe("points made in the console", () => {
  it("adds a point with its time and minutes: it is saved and sits in the agenda where its time falls", async () => {
    const { savePoints, saveMinutes } = setup();
    await settle();
    await startEditing();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.addPoint }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.point.newTitle });
    fireEvent.change(within(dialog).getByLabelText(t.point.title), { target: { value: "Café" } });
    fireEvent.change(within(dialog).getByLabelText(t.point.time), { target: { value: "10:40" } });
    fireEvent.change(within(dialog).getByLabelText(t.point.minutes), { target: { value: "15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    await settle();

    expect(savePoints).toHaveBeenCalledWith({ points: [{ id: expect.stringMatching(/^cafe-[a-z0-9]{1,4}$/), title: "Café", who: "", time: "10:40" }] });
    const id = vi.mocked(savePoints).mock.calls[0][0].points[0].id;
    expect(saveMinutes).toHaveBeenCalledWith({ itemId: id, minutes: 15 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(titles()).toEqual(["Keynote de apertura", "Café", "Agente de IA con Genkit"]);
    expect(screen.getByText(`${t.rundown.custom} · 0 archivos · 15 min`)).toBeInTheDocument();
  });

  it("asks for a name and a real time, and saves nothing until they are right", async () => {
    const { savePoints, saveMinutes } = setup();
    await settle();
    await startEditing();
    fireEvent.click(screen.getByRole("button", { name: t.rundown.addPoint }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.point.newTitle });

    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.point.errors.title);
    fireEvent.change(within(dialog).getByLabelText(t.point.title), { target: { value: "Café" } });
    fireEvent.change(within(dialog).getByLabelText(t.point.time), { target: { value: "25:99" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.point.errors.time);
    fireEvent.change(within(dialog).getByLabelText(t.point.time), { target: { value: "" } });
    fireEvent.change(within(dialog).getByLabelText(t.point.minutes), { target: { value: "700" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.point.errors.minutes);

    expect(savePoints).not.toHaveBeenCalled();
    expect(saveMinutes).not.toHaveBeenCalled();
  });

  it("says so and adds nothing when the point cannot be saved", async () => {
    const { savePoints } = setup({ savePoints: vi.fn<SavePointsAction>(async () => ({ ok: false, code: "unknown" })) });
    await settle();
    await startEditing();
    fireEvent.click(screen.getByRole("button", { name: t.rundown.addPoint }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.point.newTitle });
    fireEvent.change(within(dialog).getByLabelText(t.point.title), { target: { value: "Café" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    await settle();

    expect(savePoints).toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(t.point.errors.save);
    expect(titles()).toEqual(["Keynote de apertura", "Agente de IA con Genkit"]);
  });

  it("plans the minutes of a talk without touching the points: only that field is offered", async () => {
    const { savePoints, saveMinutes } = setup();
    await settle();
    await startEditing();

    fireEvent.click(screen.getByRole("button", { name: `Editar el punto Keynote de apertura` }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.point.editTitle });
    expect(within(dialog).queryByLabelText(t.point.title)).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(t.point.minutes), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    await settle();

    expect(saveMinutes).toHaveBeenCalledWith({ itemId: "keynote", minutes: 20 });
    expect(savePoints).not.toHaveBeenCalled();
    expect(screen.getByText("Equipo GDG Tacna · 1 archivos · 20 min")).toBeInTheDocument();
  });

  it("edits a point made here, and clears its minutes when they are left empty", async () => {
    const { savePoints, saveMinutes } = setup({ agenda: [AGENDA[0], CAFE, AGENDA[1]] });
    await settle();
    await startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar las piezas de Café" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar el punto Café" }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.point.editTitle });
    expect(within(dialog).getByLabelText(t.point.title)).toHaveValue("Café");
    fireEvent.change(within(dialog).getByLabelText(t.point.title), { target: { value: "Descanso" } });
    fireEvent.change(within(dialog).getByLabelText(t.point.minutes), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t.point.save }));
    await settle();

    expect(savePoints).toHaveBeenCalledWith({ points: [{ id: "cafe-ab12", title: "Descanso", who: "", time: "10:40" }] });
    expect(saveMinutes).toHaveBeenCalledWith({ itemId: "cafe-ab12", minutes: null });
    expect(titles()).toContain("Descanso");
  });

  it("removes a point made here with its pieces, after asking, and never a talk", async () => {
    const { savePoints, saveMinutes, saveCues } = setup({ agenda: [AGENDA[0], CAFE, AGENDA[1]], stored: { keynote: [PHOTO], "cafe-ab12": [PHOTO_2] } });
    await settle();
    await startEditing();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar las piezas de Café" }));
    expect(screen.queryByRole("button", { name: "Quitar el punto Keynote de apertura" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quitar el punto Café" }));
    await answerConfirm("cancel");
    await settle();
    expect(savePoints).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Quitar el punto Café" }));
    await answerConfirm("confirm");
    await settle();

    expect(savePoints).toHaveBeenCalledWith({ points: [] });
    expect(saveCues).toHaveBeenCalledWith({ itemId: "cafe-ab12", cues: [] });
    expect(saveMinutes).toHaveBeenCalledWith({ itemId: "cafe-ab12", minutes: null });
    expect(titles()).toEqual(["Keynote de apertura", "Agente de IA con Genkit"]);
  });
});

describe("seconds on a piece", () => {
  const secondsField = () => screen.getByLabelText("Segundos en pantalla: Portada");

  it("saves how long a piece stays on the air, shows it, and clears it when emptied", async () => {
    const { saveCues } = setup();
    await settle();
    await startEditing();

    fireEvent.change(secondsField(), { target: { value: "20" } });
    fireEvent.blur(secondsField());
    await settle();
    expect(saveCues).toHaveBeenLastCalledWith({ itemId: "keynote", cues: [{ ...PHOTO, seconds: 20 }] });
    expect(screen.getByText(/20 s en pantalla/)).toBeInTheDocument();

    fireEvent.change(secondsField(), { target: { value: "" } });
    fireEvent.blur(secondsField());
    await settle();
    expect(saveCues).toHaveBeenLastCalledWith({ itemId: "keynote", cues: [PHOTO] });
  });

  it("refuses seconds that are not whole between 1 and 3600", async () => {
    const { saveCues } = setup();
    await settle();
    await startEditing();

    fireEvent.change(secondsField(), { target: { value: "5000" } });
    fireEvent.blur(secondsField());
    await settle();
    expect(saveCues).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(t.alerts.badSeconds);
  });

  it("takes the next piece by itself once the seconds pass, and counts down while it waits", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    const { heard } = setup({ stored: { keynote: [{ ...PHOTO, seconds: 2 }, PHOTO_2] } });
    await settle();
    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    const onAir = () => heard.filter((message) => message.type === "program").at(-1);
    expect(onAir()).toMatchObject({ cue: { id: "photo-1" } });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getAllByText(/pasa en 1 s/).length).toBeGreaterThan(0);
    expect(onAir()).toMatchObject({ cue: { id: "photo-1" } });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await settle();
    expect(onAir()).toMatchObject({ cue: { id: "photo-2" } });
  });

  it("stays on the last piece when there is nothing after it, without trying again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    const { heard } = setup({ agenda: [AGENDA[0]], stored: { keynote: [{ ...PHOTO, seconds: 1 }] } });
    await settle();
    // The QR of the talk comes after the picture: take both, then wait on the QR.
    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await settle();
    const programs = heard.filter((message) => message.type === "program");
    const count = programs.length;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(heard.filter((message) => message.type === "program")).toHaveLength(count);
  });
});
