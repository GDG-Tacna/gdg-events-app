// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err } from "@/shared/lib/result";
import type { ChannelMessage } from "../domain/channel";
import type { GoogleSlidesCue, MediaCue, StoredCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, StageRunner } from "./actions";
import { RundownConsole } from "./RundownConsole";
import { channelPair, fakeLibrary, mp4, pdf } from "./test-helpers";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("./SlideCanvas", () => ({ SlideCanvas: () => <div data-testid="slide" /> }));

const t = copy.stageConsole;
const DECK_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const DECK: MediaCue = { id: "deck-1", kind: "slides", name: "Diapositivas del keynote", path: "apertura/keynote.pdf" };
const CLIP: MediaCue = { id: "clip-1", kind: "video", name: "Video de apertura", path: "apertura/video.mp4" };
const GOOGLE: GoogleSlidesCue = { id: "gs-1", kind: "gslides", name: "Keynote en Google Slides", deckId: DECK_ID, published: false };
const AGENDA = [
  { id: "keynote", time: "09:00", title: "Keynote de apertura", who: "Equipo GDG Tacna" },
  { id: "genkit", time: "09:15", title: "Agente de IA con Genkit", who: "Luis Eduardo" },
];

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });

function setup(stored: Record<string, readonly StoredCue[]> = { keynote: [DECK, CLIP, GOOGLE], genkit: [{ ...DECK, id: "deck-2", path: "genkit/agente.pdf" }] }, status: "none" | "ready" = "ready") {
  const lines = channelPair();
  const heard: ChannelMessage[] = [];
  lines.stage.subscribe((message) => heard.push(message));
  const fake = fakeLibrary({ "apertura/keynote.pdf": pdf(), "apertura/video.mp4": mp4(), "genkit/agente.pdf": pdf("agente.pdf") }, status);
  const saveCues = vi.fn<SaveCuesAction>(async ({ cues }) => ({ ok: true, cues }));
  render(
    <RundownConsole
      edition="devfest-2026"
      agenda={AGENDA}
      qrItems={["keynote", "genkit"]}
      stored={stored}
      frozen={false}
      view="both"
      squadsOn
      polls={[]}
      saveCues={saveCues}
      runStage={vi.fn<StageRunner>(async () => ({ ok: true }))}
      projectTalk={vi.fn<ProjectTalkRunner>(async () => ({ ok: true }))}
      hrefs={{ screen: "/escenario", settings: "/admin/escenario", raffle: "/admin/sorteo", back: "/admin" }}
      library={fake.library}
      openChannel={() => lines.console}
    />,
  );
  const programs = () => heard.filter((message): message is Extract<ChannelMessage, { type: "program" }> => message.type === "program");
  return { saveCues, fake, programs };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
});

describe("Google Slides in the order", () => {
  it("adds a presentation from its link to the open point, saving the presentation and not a path", async () => {
    const { saveCues } = setup({ keynote: [DECK] });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();
    const form = within(screen.getByRole("dialog")).getByRole("form", { name: t.picker.gslides.title });
    fireEvent.change(within(form).getByLabelText(t.picker.gslides.linkLabel), { target: { value: `https://docs.google.com/presentation/d/${DECK_ID}/edit?usp=sharing` } });
    fireEvent.change(within(form).getByLabelText(t.picker.gslides.nameLabel), { target: { value: "Keynote final" } });
    fireEvent.click(within(form).getByRole("button", { name: t.picker.gslides.add }));
    await settle();

    const saved = saveCues.mock.calls[0][0];
    expect(saved.itemId).toBe("keynote");
    expect(saved.cues.at(-1)).toMatchObject({ kind: "gslides", name: "Keynote final", deckId: DECK_ID, published: false });
    expect(saved.cues.at(-1)).not.toHaveProperty("path");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Keynote final")).toBeInTheDocument();
    expect(screen.getByText(t.rundown.gslidesMeta)).toBeInTheDocument();
  });

  it("works without a connected folder, and refuses a link that is not a Google Slides presentation", async () => {
    const { saveCues } = setup({ keynote: [GOOGLE] }, "none");
    await settle();
    // With no folder the first-time dialog opens: closing it leaves the console.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.setup.skip }));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.rundown.add }));
    await settle();
    const form = within(screen.getByRole("dialog")).getByRole("form", { name: t.picker.gslides.title });
    fireEvent.change(within(form).getByLabelText(t.picker.gslides.linkLabel), { target: { value: "https://example.com/mi-presentacion" } });
    fireEvent.click(within(form).getByRole("button", { name: t.picker.gslides.add }));
    await settle();

    expect(saveCues).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(t.picker.gslides.bad);
  });

  it("takes a Google Slides deck onto the air as it is, with no file, and does not call it missing", async () => {
    const { programs } = setup({ keynote: [GOOGLE] });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();

    expect(programs().at(-1)).toMatchObject({ cue: { id: "gs-1", kind: "gslides", deckId: DECK_ID, published: false } });
    expect(screen.getAllByText(t.program.googleSlides).length).toBeGreaterThan(0);
    expect(screen.queryByText(t.rundown.missing)).not.toBeInTheDocument();
  });
});

describe("changing the folder", () => {
  it("warns that the files added to the agenda are removed, and removes only those if the new folder is connected", async () => {
    const { saveCues, fake } = setup();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.folderChange }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.changeFolder.title });
    // Two files of the first point and one of the second: three. The Google Slides deck is not one of them.
    expect(dialog).toHaveTextContent(/se quitan de la agenda los 3 archivos/);
    expect(fake.library.connect).not.toHaveBeenCalled();
    expect(saveCues).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: t.changeFolder.confirm }));
    await settle();

    expect(fake.library.connect).toHaveBeenCalledTimes(1);
    const saves = Object.fromEntries(saveCues.mock.calls.map(([call]) => [call.itemId, call.cues]));
    expect(saves.keynote).toEqual([GOOGLE]);
    expect(saves.genkit).toEqual([]);
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain(t.changeFolder.done);
  });

  it("removes nothing when the person backs out of the warning", async () => {
    const { saveCues, fake } = setup();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.folderChange }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog", { name: t.changeFolder.title })).getByRole("button", { name: copy.common.cancel }));
    await settle();

    expect(fake.library.connect).not.toHaveBeenCalled();
    expect(saveCues).not.toHaveBeenCalled();
  });

  it("removes nothing when the new folder is not picked (the picker is closed)", async () => {
    const { saveCues, fake } = setup();
    vi.mocked(fake.library.connect).mockResolvedValueOnce(err("cancelled"));
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.folderChange }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog", { name: t.changeFolder.title })).getByRole("button", { name: t.changeFolder.confirm }));
    await settle();

    expect(fake.library.connect).toHaveBeenCalledTimes(1);
    expect(saveCues).not.toHaveBeenCalled();
    expect(screen.getByText("apertura/keynote.pdf")).toBeInTheDocument();
  });

  it("takes off the air a file of the old folder, and asks nothing about removing when there are none", async () => {
    const { programs, fake } = setup();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: t.transport.take }));
    await settle();
    expect(programs().at(-1)?.cue?.id).toBe("deck-1");

    fireEvent.click(screen.getByRole("button", { name: t.folderChange }));
    await settle();
    fireEvent.click(within(screen.getByRole("dialog", { name: t.changeFolder.title })).getByRole("button", { name: t.changeFolder.confirm }));
    await settle();

    expect(fake.library.connect).toHaveBeenCalled();
    // The projector's window is told nothing from the old folder is on the air.
    expect(programs().at(-1)).toMatchObject({ cue: null });
  });

  it("changes the folder without a warning about files when the agenda has none", async () => {
    const { saveCues, fake } = setup({ keynote: [GOOGLE] });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: t.folderChange }));
    await settle();
    const dialog = screen.getByRole("dialog", { name: t.changeFolder.title });
    expect(dialog).toHaveTextContent(t.changeFolder.descriptionNone);
    fireEvent.click(within(dialog).getByRole("button", { name: t.changeFolder.confirm }));
    await settle();

    expect(fake.library.connect).toHaveBeenCalledTimes(1);
    expect(saveCues).not.toHaveBeenCalled();
  });
});
