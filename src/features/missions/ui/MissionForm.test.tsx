// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
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

  const SPEAKERS = [
    { id: "ana-torres", name: "Ana Torres" },
    { id: "luis", name: "Luis Quispe" },
  ];
  const TEAM = {
    organizer: [{ id: "uid-olga-123", name: "Olga Rojas" }],
    volunteer: [
      { id: "uid-ana-123", name: "Ana Mamani" },
      { id: "uid-bruno-1", name: "Bruno Flores" },
    ],
  };
  const radio = (name: string) => screen.getByRole("radio", { name });
  const box = (name: string) => screen.getByRole("checkbox", { name });

  it("a «Conoce al speaker» mission starts accepting every speaker, with the speakers there to choose from", async () => {
    const save = renderForm({ speakers: SPEAKERS });

    type(f.type, "speaker");
    expect(screen.getByLabelText(f.xp)).toHaveValue("40");
    expect(radio(f.people.all)).toBeChecked();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    type(f.title, "Conoce a un speaker");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: null } });
  });

  it("chooses one speaker, or several, and sends the ones ticked", async () => {
    const save = renderForm({ speakers: SPEAKERS });

    type(f.type, "speaker");
    type(f.title, "Conoce a Luis");
    fireEvent.click(radio(f.people.pick));
    expect(screen.getByText(interpolate(f.people.count, { n: "0" }))).toBeInTheDocument();
    fireEvent.click(box("Luis Quispe"));
    expect(screen.getByText(f.people.countOne)).toBeInTheDocument();
    submit();
    // The form is editable again once it has gone back to the list (`push`).
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: ["luis"] } });

    fireEvent.click(box("Ana Torres"));
    expect(screen.getByText(interpolate(f.people.count, { n: "2" }))).toBeInTheDocument();
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: ["luis", "ana-torres"] } });

    // Back to «Todos» drops the choice.
    fireEvent.click(radio(f.people.all));
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: null } });
  });

  it("refuses «Elegir» with nobody chosen, on the picker, and saves nothing", () => {
    const save = renderForm({ speakers: SPEAKERS });

    type(f.type, "speaker");
    type(f.title, "Conoce a alguien");
    fireEvent.click(radio(f.people.pick));
    submit();

    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.missions.errors["invalid-speaker"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("with no speakers yet, only «Todos» can be chosen, and the form still saves", async () => {
    const save = renderForm();

    type(f.type, "speaker");
    type(f.title, "Conoce a un speaker");
    expect(radio(f.people.pick)).toBeDisabled();
    expect(screen.getByText(f.people.speakers.none)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: f.save })).toBeEnabled();
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: null } });
  });

  it("edits a speaker mission: «Todos» stays, and a chosen list comes back ticked", async () => {
    const every = renderForm({
      mode: "edit",
      speakers: SPEAKERS,
      mission: { ...quizMission({ id: "meet-any", title: "Conoce a un speaker", xp: 40 }), config: { type: "speaker", speakerIds: null } },
    });
    expect(radio(f.people.all)).toBeChecked();
    submit();
    await waitFor(() => expect(every).toHaveBeenCalled());
    expect(every.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: null } });
    cleanup();

    const some = renderForm({
      mode: "edit",
      speakers: SPEAKERS,
      mission: { ...quizMission({ id: "meet-some", title: "Conoce a Ana", xp: 40 }), config: { type: "speaker", speakerIds: ["ana-torres"] } },
    });
    expect(radio(f.people.pick)).toBeChecked();
    expect(box("Ana Torres")).toBeChecked();
    expect(box("Luis Quispe")).not.toBeChecked();
    submit();
    await waitFor(() => expect(some).toHaveBeenCalled());
    expect(some.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: ["ana-torres"] } });
  });

  it("keeps a chosen speaker who is no longer offered, marked, so the admin can untick them", async () => {
    const save = renderForm({
      mode: "edit",
      speakers: SPEAKERS,
      mission: { ...quizMission({ id: "meet-gone", title: "Conoce a Zoe", xp: 40 }), config: { type: "speaker", speakerIds: ["ana-torres", "zoe"] } },
    });

    const gone = box(interpolate(f.people.unavailable, { name: "zoe" }));
    expect(gone).toBeChecked();
    fireEvent.click(gone);
    expect(screen.queryByRole("checkbox", { name: /zoe/ })).not.toBeInTheDocument();
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "speaker", speakerIds: ["ana-torres"] } });
  });

  it("asks which role a «Conoce al equipo» mission asks to meet, accepting every member of it by default", async () => {
    const save = renderForm({ team: TEAM });

    type(f.type, "team");
    expect(screen.getByLabelText(f.xp)).toHaveValue("30");
    expect(screen.getByLabelText(f.teamRole)).toHaveValue("volunteer");
    type(f.teamRole, "organizer");
    expect(radio(f.people.all)).toBeChecked();
    type(f.title, "Conoce a un organizador");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ xp: 30, config: { type: "team", role: "organizer", memberUids: null } });
  });

  it("chooses team members from the people of the role, and sends their uids", async () => {
    const save = renderForm({ team: TEAM });

    type(f.type, "team");
    type(f.title, "Conoce a Ana o a Bruno");
    fireEvent.click(radio(f.people.pick));
    expect(screen.getByRole("checkbox", { name: "Ana Mamani" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Olga Rojas" })).not.toBeInTheDocument();
    fireEvent.click(box("Ana Mamani"));
    fireEvent.click(box("Bruno Flores"));
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "team", role: "volunteer", memberUids: ["uid-ana-123", "uid-bruno-1"] } });
  });

  it("changing the role clears the chosen members and lists the other role's people, still waiting for a choice", () => {
    const save = renderForm({ team: TEAM });

    type(f.type, "team");
    type(f.title, "Conoce a alguien");
    fireEvent.click(radio(f.people.pick));
    fireEvent.click(box("Ana Mamani"));
    type(f.teamRole, "organizer");

    expect(radio(f.people.pick)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Ana Mamani" })).not.toBeInTheDocument();
    expect(box("Olga Rojas")).not.toBeChecked();
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.missions.errors["invalid-team-members"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("edits a team mission with its chosen members ticked", async () => {
    const save = renderForm({
      mode: "edit",
      team: TEAM,
      mission: { ...quizMission({ id: "meet-vol", title: "Conoce a Bruno", xp: 30 }), config: { type: "team", role: "volunteer", memberUids: ["uid-bruno-1"] } },
    });

    expect(radio(f.people.pick)).toBeChecked();
    expect(box("Bruno Flores")).toBeChecked();
    expect(box("Ana Mamani")).not.toBeChecked();
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ config: { type: "team", role: "volunteer", memberUids: ["uid-bruno-1"] } });
  });

  it("shows a refused speaker or team member on the picker", async () => {
    renderForm({ speakers: SPEAKERS, save: vi.fn<SaveMissionAction>(async () => ({ ok: false, code: "unknown-speaker" })) });

    type(f.type, "speaker");
    type(f.title, "Conoce a un speaker");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.missions.errors["unknown-speaker"]);
    cleanup();

    renderForm({ team: TEAM, save: vi.fn<SaveMissionAction>(async () => ({ ok: false, code: "unknown-team-member" })) });
    type(f.type, "team");
    type(f.title, "Conoce a alguien");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.missions.errors["unknown-team-member"]);
  });

  it("needs nothing more than texts for a «Conoce a cada escuadrón» mission", async () => {
    const save = renderForm();

    type(f.type, "squads");
    expect(screen.getByLabelText(f.xp)).toHaveValue("60");
    expect(screen.getByText(f.squadsHint)).toBeInTheDocument();
    type(f.title, "Conoce a cada escuadrón");
    submit();

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft).toMatchObject({ xp: 60, config: { type: "squads" } });
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
    const { container } = render(
      <MissionForm mode="create" save={vi.fn()} upload={upload} quadrants={QUADRANTS} checkpoints={CHECKPOINTS} speakers={SPEAKERS} team={TEAM} listHref="/x" minigames={GAMES} />,
    );
    type(f.minigame, "bug-kong");
    for (const value of ["quiz", "keyword", "stand", "talk", "speaker", "team", "squads"]) {
      type(f.type, value);
      expect((await axe(container)).violations).toEqual([]);
    }
  });
});
