// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { UploadImageAction } from "@/features/media";
import type { Mission } from "../domain/mission";
import type { SaveMissionAction } from "./admin-actions";
import { MissionForm } from "./MissionForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const f = copy.admin.missions.form;
const QUADRANTS = [
  { id: "ai", name: "AI" },
  { id: "cloud", name: "Google Cloud" },
];
const CHECKPOINTS = { talk: [{ id: "talk-keynote", name: "Charla inaugural" }], stand: [{ id: "stand-ai-1", name: "Stand AI 1" }, { id: "stand-ai-2", name: "Stand AI 2" }] };

const PICTURE = "public/devfest-2026/mission/0f8e2c1a-1111-4222-8333-944455551111.webp";
const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: PICTURE, url: `https://cdn/${PICTURE}`, width: 64, height: 64, format: "webp" } }));

function renderForm(props: Partial<Parameters<typeof MissionForm>[0]> = {}) {
  const save = vi.fn<SaveMissionAction>(async () => ({ ok: true }));
  render(<MissionForm mode="create" save={save} upload={upload} quadrants={QUADRANTS} checkpoints={CHECKPOINTS} listHref="/admin/misiones" {...props} />);
  return save;
}

const GAMES = [
  { id: "bug-kong", name: "Bug Kong", enabled: true, difficulty: "normal" },
  { id: "circuits", name: "Conecta los circuitos", enabled: false, difficulty: "hard" },
  { id: "warp-timing", name: "Salto en el momento justo", enabled: true, difficulty: "easy" },
] as const;

const quizMission = (extra: Partial<Mission> = {}): Mission => ({
  id: "ai-quiz",
  title: "Desafío AI",
  description: "",
  quadrantId: "ai",
  xp: 40,
  order: 0,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config: { type: "quiz", question: "¿Qué es Gemini?", options: ["Un modelo", "Un lenguaje"], answer: 0 },
  ...extra,
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: f.save }));

describe("MissionForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });

  it("creates a quiz: suggests the id from the title, uses the default XP, and goes back to the list", async () => {
    const save = renderForm();

    type(f.title, "Desafío de Gemini");
    expect(screen.getByLabelText(f.id)).toHaveValue("desafio-de-gemini");
    expect(screen.getByLabelText(f.xp)).toHaveValue("40");
    type(f.question, "¿Quién reemplazó a Bard?");
    type("Opción 1", "Colab");
    type("Opción 2", "Gemini");
    fireEvent.click(screen.getByRole("radio", { name: `${f.correct}: Opción 2` }));
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/misiones"));
    expect(save).toHaveBeenCalledWith({
      id: "desafio-de-gemini",
      draft: {
        title: "Desafío de Gemini",
        description: "",
        quadrantId: "ai",
        xp: 40,
        credits: null,
        minigame: null,
        minigameDifficulty: null,
        config: { type: "quiz", question: "¿Quién reemplazó a Bard?", options: ["Colab", "Gemini"], answer: 1 },
      },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("adds options up to four, removes them keeping the right answer on its option", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: f.addOption }));
    fireEvent.click(screen.getByRole("button", { name: f.addOption }));
    expect(screen.queryByRole("button", { name: f.addOption })).not.toBeInTheDocument();
    type("Opción 3", "Tercera");
    fireEvent.click(screen.getByRole("radio", { name: `${f.correct}: Opción 3` }));

    fireEvent.click(screen.getByRole("button", { name: "Quitar la opción 1" }));

    expect(screen.getByLabelText("Opción 2")).toHaveValue("Tercera");
    expect(screen.getByRole("radio", { name: `${f.correct}: Opción 2` })).toBeChecked();
  });

  it("says which field is wrong before sending", () => {
    const save = renderForm();

    type(f.title, "ab");
    submit();
    expect(screen.getByLabelText(f.title)).toHaveAccessibleDescription(expect.stringContaining(copy.admin.missions.errors["invalid-title"]));

    type(f.title, "Desafío válido");
    type(f.question, "¿Pregunta larga?");
    submit();
    expect(screen.getByText(copy.admin.missions.errors["invalid-options"])).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("creates a keyword mission, splitting the keywords by commas", async () => {
    const save = renderForm();

    type(f.type, "keyword");
    expect(screen.getByLabelText(f.xp)).toHaveValue("40");
    type(f.title, "Clave AI");
    type(f.prompt, "Pide la clave en el stand");
    type(f.keywords, " red neuronal, Gemini ,");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.config).toEqual({ type: "keyword", prompt: "Pide la clave en el stand", keywords: ["red neuronal", "Gemini"] });
  });

  it("points a stand mission to an open stand, with the stand's default XP unless the admin typed one", async () => {
    const save = renderForm();

    type(f.type, "stand");
    expect(screen.getByLabelText(f.xp)).toHaveValue("30");
    type(f.checkpoint.stand, "stand-ai-2");
    type(f.title, "Visita AI");
    type(f.quadrant, "cloud");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ quadrantId: "cloud", xp: 30, config: { type: "stand", checkpointId: "stand-ai-2" } });
  });

  it("points a «Conoce al speaker» mission to an active speaker, and asks to add one when there is none", async () => {
    const save = renderForm({ speakers: [{ id: "ana-torres", name: "Ana Torres" }, { id: "luis", name: "Luis Quispe" }] });

    type(f.type, "speaker");
    expect(screen.getByLabelText(f.xp)).toHaveValue("40");
    type(f.checkpoint.speaker, "luis");
    type(f.title, "Conoce a Luis");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerId: "luis" } });
    cleanup();

    renderForm();
    type(f.type, "speaker");
    expect(screen.getByText(f.noCheckpoints.speaker)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: f.save })).toBeDisabled();
  });

  it("offers G-Credits only when the edition gives them, with the type's default as the hint, and sends what was typed", async () => {
    const save = renderForm({ creditDefaults: { talk: 10, stand: 10, quiz: 5, keyword: 5 } });

    expect(screen.getByLabelText(f.credits)).toHaveAccessibleDescription(expect.stringContaining("(5)"));
    type(f.type, "stand");
    expect(screen.getByLabelText(f.credits)).toHaveAccessibleDescription(expect.stringContaining("(10)"));
    type(f.title, "Visita AI");
    type(f.credits, "2a5");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.credits).toBe(25);
  });

  it("has no G-Credits field when the edition gives none", () => {
    renderForm();

    expect(screen.queryByLabelText(f.credits)).not.toBeInTheDocument();
  });

  it("keeps a typed XP when the type changes", () => {
    renderForm();

    type(f.xp, "75");
    type(f.type, "talk");

    expect(screen.getByLabelText(f.xp)).toHaveValue("75");
  });

  it("asks to create a talk first when there is none, and does not let it save", () => {
    renderForm({ checkpoints: { talk: [], stand: [] } });

    type(f.type, "talk");

    expect(screen.getByRole("alert")).toHaveTextContent(f.noCheckpoints.talk);
    expect(screen.getByRole("button", { name: f.save })).toBeDisabled();
  });

  it("edits a mission: prefilled, type locked, id kept", async () => {
    const mission: Mission = {
      id: "ai-kw",
      title: "Clave AI",
      description: "Pide la clave",
      quadrantId: "ai",
      xp: 55,
      order: 3,
      active: true,
      credits: null,
      minigame: null,
      minigameDifficulty: null,
      config: { type: "keyword", prompt: "Escribe la clave del stand", keywords: ["red neuronal", "gemini"] },
    };
    const save = renderForm({ mode: "edit", mission });

    expect(screen.getByLabelText(f.type)).toBeDisabled();
    expect(screen.queryByLabelText(f.id)).not.toBeInTheDocument();
    expect(screen.getByLabelText(f.keywords)).toHaveValue("red neuronal, gemini");
    expect(screen.getByLabelText(f.xp)).toHaveValue("55");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ id: "ai-kw", draft: { xp: 55, config: { keywords: ["red neuronal", "gemini"] } } });
  });

  it("sends a picture only when it changed, and null to remove it", async () => {
    const untouched = renderForm({ mode: "edit", mission: quizMission({ image: { path: PICTURE, url: `https://cdn/${PICTURE}` } }) });
    submit();
    await waitFor(() => expect(untouched).toHaveBeenCalled());
    expect(untouched.mock.calls[0][0].draft).not.toHaveProperty("imagePath");
    cleanup();

    const removing = renderForm({ mode: "edit", mission: quizMission({ image: { path: PICTURE, url: `https://cdn/${PICTURE}` } }) });
    fireEvent.click(screen.getByRole("button", { name: copy.common.image.remove }));
    submit();
    await waitFor(() => expect(removing).toHaveBeenCalled());
    expect(removing.mock.calls[0][0].draft.imagePath).toBeNull();
    cleanup();

    const adding = renderForm({ mode: "edit", mission: quizMission() });
    fireEvent.change(screen.getByTestId("image-input-mission"), { target: { files: [new File([new Uint8Array(10)], "m.png", { type: "image/png" })] } });
    await screen.findByRole("img", { name: `Vista previa: ${f.image}` });
    submit();
    await waitFor(() => expect(adding).toHaveBeenCalled());
    expect(adding.mock.calls[0][0].draft.imagePath).toBe(PICTURE);
  });

  it("offers the edition's games, with no game by default, and sends the chosen one with its own difficulty", async () => {
    const save = renderForm({ mode: "edit", mission: quizMission(), minigames: GAMES });

    const games = screen.getByLabelText(f.minigame);
    expect(games).toHaveValue("");
    expect([...games.querySelectorAll("option")].map((option) => option.textContent)).toEqual([f.minigameNone, "Bug Kong", "Salto en el momento justo"]);
    expect(screen.queryByLabelText(f.minigameDifficulty)).not.toBeInTheDocument();

    type(f.minigame, "warp-timing");
    const levels = screen.getByLabelText(f.minigameDifficulty);
    expect(levels).toHaveValue("");
    expect([...levels.querySelectorAll("option")].map((option) => option.textContent)).toEqual(["La de la edición (Fácil)", "Fácil", "Normal", "Difícil"]);
    type(f.minigameDifficulty, "hard");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ minigame: "warp-timing", minigameDifficulty: "hard" });
  });

  it("removes the game and its difficulty together", async () => {
    const save = renderForm({ mode: "edit", mission: quizMission({ minigame: "bug-kong", minigameDifficulty: "easy" }), minigames: GAMES });

    expect(screen.getByLabelText(f.minigame)).toHaveValue("bug-kong");
    expect(screen.getByLabelText(f.minigameDifficulty)).toHaveValue("easy");
    type(f.minigame, "");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ minigame: null, minigameDifficulty: null });
  });

  it("keeps a game the edition switched off, marked and explained, so saving never drops it", async () => {
    const save = renderForm({ mode: "edit", mission: quizMission({ minigame: "circuits" }), minigames: GAMES });

    expect(screen.getByLabelText(f.minigame)).toHaveValue("circuits");
    expect(screen.getByRole("option", { name: "Conecta los circuitos (apagado en esta edición)" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(f.minigameOffNote);
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ minigame: "circuits", minigameDifficulty: null });
  });

  it("has no game field when mini-games are off, and keeps the mission's own", async () => {
    const save = renderForm({ mode: "edit", mission: quizMission({ minigame: "circuits", minigameDifficulty: "hard" }) });

    expect(screen.queryByLabelText(f.minigame)).not.toBeInTheDocument();
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ minigame: "circuits", minigameDifficulty: "hard" });
  });

  it("starts with no game when the mission's game is no longer built", async () => {
    const save = renderForm({ mode: "edit", mission: quizMission({ minigame: "asteroids", minigameDifficulty: "hard" }), minigames: GAMES });

    expect(screen.getByLabelText(f.minigame)).toHaveValue("");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ minigame: null, minigameDifficulty: null });
  });

  it("shows a refused game on its field", async () => {
    renderForm({ mode: "edit", mission: quizMission(), minigames: GAMES, save: vi.fn<SaveMissionAction>(async () => ({ ok: false, code: "unknown-minigame" })) });

    type(f.minigame, "bug-kong");
    submit();

    await waitFor(() => expect(screen.getByLabelText(f.minigame)).toHaveAccessibleDescription(expect.stringContaining(copy.admin.missions.errors["unknown-minigame"])));
  });

  it("shows a server refusal on its field, or above the form, and stays", async () => {
    const save = vi.fn<SaveMissionAction>().mockResolvedValueOnce({ ok: false, code: "already-exists" }).mockResolvedValueOnce({ ok: false, code: "unknown-quadrant" });
    renderForm({ save });
    type(f.title, "Desafío nuevo");
    type(f.question, "¿Pregunta larga?");
    type("Opción 1", "Sí");
    type("Opción 2", "No");

    submit();
    expect(await screen.findByText(copy.admin.missions.errors["already-exists"])).toBeInTheDocument();
    submit();
    expect(await screen.findByText(copy.admin.missions.errors["unknown-quadrant"])).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations for each type", async () => {
    const { container } = render(<MissionForm mode="create" save={vi.fn()} upload={upload} quadrants={QUADRANTS} checkpoints={CHECKPOINTS} listHref="/x" minigames={GAMES} />);
    type(f.minigame, "bug-kong");
    for (const value of ["quiz", "keyword", "stand", "talk"]) {
      type(f.type, value);
      expect((await axe(container)).violations).toEqual([]);
    }
  });
});
