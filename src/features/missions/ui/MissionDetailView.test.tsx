// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { BoardMission } from "../domain/use-cases";
import type { SubmitMissionAction, SubmitMissionActionResult } from "./answer-action";
import { MissionDetailView } from "./MissionDetailView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const QUIZ: BoardMission = {
  id: "ai-quiz",
  title: "Desafío AI",
  description: "Responde la pregunta.",
  quadrantId: "ai",
  type: "quiz",
  xp: 40,
  credits: 5,
  config: { type: "quiz", question: "¿Qué asistente reemplazó a Bard?", options: ["Colab", "Gemini"] },
  status: "open",
  xpEarned: 0,
  creditsEarned: 0,
  attemptsLeft: 2,
  minigame: null,
};
const KEYWORD: BoardMission = { ...QUIZ, id: "ai-kw", type: "keyword", title: "Clave AI", config: { type: "keyword", prompt: "Escribe la clave del stand." }, attemptsLeft: null };
const STAND: BoardMission = { ...QUIZ, id: "ai-stand", type: "stand", title: "Visita AI", config: { type: "stand" }, attemptsLeft: null };
const TALK: BoardMission = { ...STAND, id: "keynote", type: "talk", config: { type: "talk" } };

const answered = (extra: Partial<Extract<SubmitMissionActionResult, { ok: true }>>): SubmitMissionActionResult => ({
  ok: true,
  status: "completed",
  xpEarned: 40,
  creditsEarned: 0,
  attemptsLeft: 0,
  closed: false,
  ...extra,
});

function renderView(mission: BoardMission, answer: SubmitMissionAction = vi.fn(async () => answered({})), extra: Partial<Parameters<typeof MissionDetailView>[0]> = {}) {
  return render(<MissionDetailView mission={mission} answer={answer} backHref="/missions" scanHref="/scan" passHref="/pass" {...extra} />);
}

const choose = (option: string) => fireEvent.click(screen.getByRole("radio", { name: option }));
const submit = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("MissionDetailView", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it("celebrates the badges an answer unlocked, linking to Logros", async () => {
    const answer = vi.fn<SubmitMissionAction>(async () => answered({ achievements: [{ id: "primer-salto", name: "Primer salto", tone: "cyan" }] }));
    render(<MissionDetailView mission={QUIZ} answer={answer} backHref="/missions" scanHref="/scan" achievementsHref="/achievements" />);

    expect(screen.queryByText(copy.achievements.unlocked.title)).not.toBeInTheDocument();
    choose("Gemini");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByText(copy.achievements.unlocked.title)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: copy.achievements.unlocked.label })).toHaveTextContent("Primer salto");
    expect(screen.getByRole("link", { name: copy.achievements.unlocked.see })).toHaveAttribute("href", "/achievements");
  });

  it("shows the bonus the app shell passes in, under the result", () => {
    render(<MissionDetailView mission={QUIZ} answer={vi.fn()} backHref="/missions" scanHref="/scan" bonusSlot={<section aria-label="Bonus">Jugar</section>} />);

    expect(screen.getByRole("region", { name: "Bonus" })).toHaveTextContent("Jugar");
  });

  it("shows the mission with its type, XP and a way back", () => {
    renderView(QUIZ);

    expect(screen.getByRole("heading", { level: 1, name: "Desafío AI" })).toBeInTheDocument();
    expect(screen.getByText(copy.missions.types.quiz)).toBeInTheDocument();
    expect(screen.getByText("+40 XP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.missions.back })).toHaveAttribute("href", "/missions");
  });

  it("answers a quiz: the button waits for a choice, sends it, and shows the XP earned with focus on it", async () => {
    const answer = vi.fn<SubmitMissionAction>(async () => answered({}));
    renderView(QUIZ, answer);

    expect(screen.getByRole("group", { name: QUIZ.config.type === "quiz" ? QUIZ.config.question : "" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.missions.quiz.submit })).toBeDisabled();
    choose("Gemini");
    submit(copy.missions.quiz.submit);

    const result = await screen.findByText("¡Correcto! Ganaste 40 XP.");
    expect(answer).toHaveBeenCalledWith({ missionId: "ai-quiz", answer: { kind: "choice", option: 1 } });
    await waitFor(() => expect(result).toHaveFocus());
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("never sends a quiz without a choice, even if the form is submitted from the keyboard", () => {
    const answer = vi.fn<SubmitMissionAction>();
    renderView(QUIZ, answer);

    fireEvent.submit(screen.getByRole("button", { name: copy.missions.quiz.submit }).closest("form")!);

    expect(answer).not.toHaveBeenCalled();
  });

  it("after a wrong first answer explains the second try at half XP and clears the choice", async () => {
    renderView(QUIZ, vi.fn(async () => answered({ status: "in-progress", xpEarned: 0, attemptsLeft: 1 })));

    choose("Colab");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByText(copy.missions.result.wrongRetry)).toBeInTheDocument();
    expect(screen.getByText(copy.missions.attemptsLeft.one)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Colab" })).not.toBeChecked();
    expect(await screen.findByRole("button", { name: copy.missions.quiz.submit })).toBeDisabled();
  });

  it("closes the quiz after a second wrong answer", async () => {
    renderView({ ...QUIZ, status: "in-progress", attemptsLeft: 1 }, vi.fn(async () => answered({ status: "failed", xpEarned: 0 })));

    choose("Colab");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByText(copy.missions.result.wrongClosed)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("names the XP and the G-Credits a right answer earned, and shows the credits a mission gives", async () => {
    renderView(QUIZ, vi.fn(async () => answered({ creditsEarned: 5 })));

    expect(screen.getByText("+5 G-Credits")).toBeInTheDocument();
    choose("Gemini");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByText("¡Correcto! Ganaste 40 XP y 5 G-Credits.")).toBeInTheDocument();
  });

  it("says when a right answer earned nothing (half of a 1 XP mission)", async () => {
    renderView(QUIZ, vi.fn(async () => answered({ xpEarned: 0 })));

    choose("Gemini");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByText(copy.missions.result.correctNoXp)).toBeInTheDocument();
  });

  it("sends a keyword, asks for one when the field is empty, and keeps the field after a wrong word", async () => {
    const answer = vi
      .fn<SubmitMissionAction>()
      .mockResolvedValueOnce(answered({ status: "in-progress", xpEarned: 0, attemptsLeft: null }))
      .mockResolvedValueOnce(answered({}));
    renderView(KEYWORD, answer);

    submit(copy.missions.keyword.submit);
    expect(screen.getByText(copy.missions.keyword.empty)).toBeInTheDocument();
    expect(answer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(copy.missions.keyword.label), { target: { value: "otra" } });
    submit(copy.missions.keyword.submit);
    expect(await screen.findByText(copy.missions.result.wrongKeyword)).toBeInTheDocument();
    expect(answer).toHaveBeenCalledWith({ missionId: "ai-kw", answer: { kind: "keyword", value: "otra" } });

    fireEvent.click(await screen.findByRole("button", { name: copy.missions.keyword.submit }));
    expect(await screen.findByText("¡Correcto! Ganaste 40 XP.")).toBeInTheDocument();
    expect(screen.queryByLabelText(copy.missions.keyword.label)).not.toBeInTheDocument();
  });

  it("sends a talk mission to the scanner (the code is on the talk's screen)", () => {
    renderView(TALK);

    expect(screen.getByText(copy.missions.howTo.talk)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.missions.scan })).toHaveAttribute("href", "/scan");
    expect(screen.queryByRole("link", { name: copy.missions.showQr })).not.toBeInTheDocument();
  });

  it("sends a «Conoce al speaker» mission to the scanner (the speaker shows the code)", () => {
    renderView({ ...STAND, id: "meet-ana", type: "speaker", config: { type: "speaker" } });

    expect(screen.getByText(copy.missions.howTo.speaker)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.missions.scan })).toHaveAttribute("href", "/scan");
    expect(screen.queryByRole("link", { name: copy.missions.showQr })).not.toBeInTheDocument();
  });

  it("sends a stand mission to the cadet's own QR (the staff scan it at the stand), never to the scanner", () => {
    const { unmount } = renderView(STAND);

    expect(screen.getByText(copy.missions.howTo.stand)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.missions.showQr })).toHaveAttribute("href", "/pass");
    expect(screen.queryByRole("link", { name: copy.missions.scan })).not.toBeInTheDocument();
    unmount();

    // With check-ins off there is no QR to show: the explanation stays, without a button.
    renderView(STAND, undefined, { passHref: undefined });
    expect(screen.queryByRole("link", { name: copy.missions.showQr })).not.toBeInTheDocument();
  });

  it("shows its tags: type, quadrant and the mini-game when it offers one", () => {
    const { unmount } = renderView(QUIZ, undefined, { quadrant: { name: "AI", planet: "ai" }, minigame: true });

    const tags = within(screen.getByRole("list", { name: copy.missions.tags.label }));
    expect(tags.getAllByRole("listitem").map((tag) => tag.textContent)).toEqual([copy.missions.types.quiz, "AI", `${copy.missions.tags.minigameBonus}${copy.missions.tags.minigame}`]);
    unmount();

    renderView(QUIZ);
    expect(within(screen.getByRole("list", { name: copy.missions.tags.label })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows a finished mission without a form", () => {
    const { unmount } = renderView({ ...QUIZ, status: "completed", xpEarned: 20, attemptsLeft: 0 });
    expect(screen.getByText("Misión completada. Ganaste 20 XP.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.missions.quiz.submit })).not.toBeInTheDocument();
    unmount();

    renderView({ ...STAND, status: "failed" });
    expect(screen.getByText(copy.missions.result.failed)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.missions.scan })).not.toBeInTheDocument();
  });

  it.each(["rate-limited", "not-registered", "inactive", "unknown"] as const)("explains a %s refusal and lets the attendee try again", async (code) => {
    renderView(QUIZ, vi.fn(async () => ({ ok: false, code }) as const));

    choose("Gemini");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.missions.errors[code]);
    expect(screen.getByRole("radio", { name: "Gemini" })).toBeChecked();
    expect(await screen.findByRole("button", { name: copy.missions.quiz.submit })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats an action that throws as an unknown failure", async () => {
    renderView(QUIZ, vi.fn(async () => { throw new Error("network"); }));

    choose("Gemini");
    submit(copy.missions.quiz.submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.missions.errors.unknown);
  });

  it("has no detectable accessibility violations (quiz, keyword, scan)", async () => {
    for (const mission of [QUIZ, KEYWORD, STAND]) {
      const { container, unmount } = renderView(mission);
      expect((await axe(container)).violations).toEqual([]);
      unmount();
    }
  });
});
