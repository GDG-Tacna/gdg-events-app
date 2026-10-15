// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { DEFAULT_MINIGAME_SETTINGS, type MinigameSettings } from "../domain/settings";
import type { GameProps } from "./games/shared";
import { MinigameSettingsView } from "./MinigameSettingsView";
import type { SaveMinigameSettingsAction } from "./settings-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const m = copy.admin.minigames;

/** A stand-in game: two buttons that end it, and the difficulty it was started with. */
function FakeGame({ difficulty, onFinish }: GameProps) {
  return (
    <div>
      <p>Juego de prueba ({difficulty})</p>
      <button onClick={() => onFinish(true)}>Ganar</button>
      <button onClick={() => onFinish(false)}>Perder</button>
    </div>
  );
}
const FAKE_GAMES = { "bug-kong": FakeGame, circuits: FakeGame };

function renderView(settings: MinigameSettings = DEFAULT_MINIGAME_SETTINGS, save = vi.fn<SaveMinigameSettingsAction>(async () => ({ ok: true })), isDefault = false) {
  return { ...render(<MinigameSettingsView settings={settings} isDefault={isDefault} eventId="devfest-2026" save={save} games={FAKE_GAMES} />), save };
}

const card = (name: string) => screen.getByRole("group", { name });
const submit = () => fireEvent.click(screen.getByRole("button", { name: m.save }));

describe("MinigameSettingsView", () => {
  beforeEach(() => refresh.mockReset());

  it("shows every game with how it is played, whether it is offered, its difficulty and how long it lasts", () => {
    renderView(undefined, undefined, true);

    expect(screen.getByText(m.defaultNote)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: m.gamesLabel })).getAllByRole("listitem")).toHaveLength(5);
    const kong = card("Bug Kong");
    expect(kong).toHaveTextContent(copy.minigames.howTo["bug-kong"]);
    expect(within(kong).getByLabelText(m.enabled)).toBeChecked();
    expect(within(kong).getByLabelText(m.difficulty)).toHaveValue("normal");
    expect(kong).toHaveTextContent("Hasta 60 s");

    fireEvent.change(within(kong).getByLabelText(m.difficulty), { target: { value: "easy" } });
    expect(kong).toHaveTextContent("Hasta 75 s");
  });

  it("says which edition the settings apply to", () => {
    renderView();

    expect(screen.getByText("Se aplica a la edición devfest-2026")).toBeInTheDocument();
  });

  it("finds games by name or by how they are played, ignoring accents and case", () => {
    renderView();
    const search = screen.getByRole("searchbox", { name: m.search });
    const shown = () => within(screen.getByRole("list", { name: m.gamesLabel })).queryAllByRole("listitem").map((item) => item.querySelector("h2")?.textContent);

    fireEvent.change(search, { target: { value: "KONG" } });
    expect(shown()).toEqual(["Bug Kong"]);

    fireEvent.change(search, { target: { value: "codigo" } });
    expect(shown()).toContain(copy.minigames.names["code-order"]);

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(shown()).toEqual([]);
    expect(screen.getByText("Ningún mini-juego coincide con «zzz».")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(shown()).toHaveLength(5);
  });

  it("keeps a change made to a game while it was hidden by the search", async () => {
    const { save } = renderView();
    const search = screen.getByRole("searchbox", { name: m.search });

    fireEvent.click(within(card("Bug Kong")).getByLabelText(m.enabled));
    fireEvent.change(search, { target: { value: "circuit" } });
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].games["bug-kong"].enabled).toBe(false);
  });

  it("plays a game in a dialog with the chosen difficulty, without saving anything, and again", () => {
    const { save } = renderView();

    fireEvent.change(within(card("Bug Kong")).getByLabelText(m.difficulty), { target: { value: "hard" } });
    fireEvent.click(screen.getByRole("button", { name: "Probar Bug Kong" }));

    const dialog = screen.getByRole("dialog", { name: "Probar Bug Kong" });
    expect(dialog).toHaveTextContent(m.preview.note);
    expect(within(dialog).getByText("Juego de prueba (hard)")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Ganar" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(m.preview.won);
    fireEvent.click(within(dialog).getByRole("button", { name: m.preview.again }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Perder" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(m.preview.lost);

    fireEvent.click(within(dialog).getByRole("button", { name: copy.common.close }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("says when a game cannot be tried yet", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: `Probar ${copy.minigames.names["warp-timing"]}` }));

    expect(within(screen.getByRole("dialog")).getByText(copy.minigames.errors["not-available"])).toBeInTheDocument();
  });

  it("saves the games switched off and their difficulty, then refreshes", async () => {
    const { save } = renderView();

    fireEvent.click(within(card("Bug Kong")).getByLabelText(m.enabled));
    fireEvent.change(within(card("Conecta los circuitos")).getByLabelText(m.difficulty), { target: { value: "hard" } });
    submit();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(m.saved));
    expect(save).toHaveBeenCalledWith({
      games: { ...DEFAULT_MINIGAME_SETTINGS.games, "bug-kong": { enabled: false, difficulty: "normal" }, circuits: { enabled: true, difficulty: "hard" } },
      codeLanguages: ["javascript", "python"],
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("locks the difficulty of a game that is switched off", () => {
    renderView();

    fireEvent.click(within(card("Salto en el momento justo")).getByLabelText(m.enabled));

    expect(within(card("Salto en el momento justo")).getByLabelText(m.difficulty)).toBeDisabled();
  });

  it("chooses the languages of Ordena el código, and needs at least one", async () => {
    const { save } = renderView();
    const code = card("Ordena el código");

    fireEvent.click(within(code).getByLabelText(m.languageNames.javascript));
    submit();
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].codeLanguages).toEqual(["python"]);

    fireEvent.click(within(code).getByLabelText(m.languageNames.python));
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(m.errors["invalid-settings"]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the languages in catalog order whatever order they are ticked", async () => {
    const { save } = renderView({ ...DEFAULT_MINIGAME_SETTINGS, codeLanguages: ["python"] });

    fireEvent.click(within(card("Ordena el código")).getByLabelText(m.languageNames.javascript));
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].codeLanguages).toEqual(["javascript", "python"]);
  });

  it("shows a refusal or a failure and keeps the changes", async () => {
    const save = vi.fn<SaveMinigameSettingsAction>().mockResolvedValueOnce({ ok: false, code: "forbidden" }).mockRejectedValueOnce(new Error("offline"));
    renderView(undefined, save);

    fireEvent.click(within(card("Bug Kong")).getByLabelText(m.enabled));
    submit();
    expect(await screen.findByText(m.errors.forbidden)).toBeInTheDocument();
    submit();
    expect(await screen.findByText(m.errors.unknown)).toBeInTheDocument();
    expect(within(card("Bug Kong")).getByLabelText(m.enabled)).not.toBeChecked();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderView();

    expect((await axe(container)).violations).toEqual([]);
  });
});
