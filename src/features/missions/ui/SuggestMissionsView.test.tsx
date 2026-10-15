// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { SuggestedMission } from "../domain/suggest";
import type { SuggestMissionsAction } from "./suggest-action";
import { SuggestMissionsView } from "./SuggestMissionsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const s = copy.admin.missions.suggestions;
const QUADRANTS = [
  { id: "ai", name: "AI" },
  { id: "cloud", name: "Google Cloud" },
];
const QUIZ: SuggestedMission = {
  id: "ai-desafio-gemini",
  draft: { title: "Desafío Gemini", description: "Responde", quadrantId: "ai", xp: 40, config: { type: "quiz", question: "¿Qué es Gemini?", options: ["Un lenguaje", "Un modelo"], answer: 1 } },
};
const KEYWORD: SuggestedMission = {
  id: "ai-clave",
  draft: { title: "Clave estelar", description: "", quadrantId: "ai", xp: 40, config: { type: "keyword", prompt: "Pide la palabra", keywords: ["red neuronal", "gemini"] } },
};

function renderView(suggest: SuggestMissionsAction = vi.fn(async () => ({ ok: true as const, suggestions: [QUIZ, KEYWORD] }))) {
  render(<SuggestMissionsView quadrants={QUADRANTS} checkpoints={{ talk: [], stand: [] }} suggest={suggest} save={vi.fn()} upload={vi.fn()} listHref="/admin/misiones" />);
  return suggest;
}

const ask = (topic = "Charla sobre Gemini y agentes") => {
  fireEvent.change(screen.getByLabelText(s.topic), { target: { value: topic } });
  fireEvent.click(screen.getByRole("button", { name: s.submit }));
};

describe("SuggestMissionsView", () => {
  it("asks with the quadrant, topic, types and count, and shows the proposals in full", async () => {
    const suggest = renderView();

    fireEvent.change(screen.getByLabelText(s.quadrant), { target: { value: "cloud" } });
    fireEvent.click(screen.getByRole("checkbox", { name: copy.missions.types.keyword }));
    fireEvent.change(screen.getByLabelText(s.count), { target: { value: "2" } });
    ask();

    // Focus moves in an effect after the results render: wait for it instead of racing it.
    const results = await screen.findByRole("heading", { level: 2, name: s.resultsTitle });
    await waitFor(() => expect(results).toHaveFocus());
    expect(suggest).toHaveBeenCalledWith({ topic: "Charla sobre Gemini y agentes", quadrantId: "cloud", types: ["quiz"], count: 2 });
    const list = screen.getByRole("list", { name: s.resultsLabel });
    expect(within(list).getByText("¿Qué es Gemini?")).toBeInTheDocument();
    expect(within(list).getByRole("img", { name: s.correct }).parentElement).toHaveTextContent("Un modelo");
    expect(within(list).getByText("Palabras clave: red neuronal, gemini")).toBeInTheDocument();
    expect(screen.getAllByText(s.warning).length).toBeGreaterThan(0);
  });

  it("checks the topic and the types before asking", () => {
    const suggest = renderView();

    ask("corto");
    expect(screen.getByRole("alert")).toHaveTextContent(s.errors["invalid-topic"]);
    fireEvent.click(screen.getByRole("checkbox", { name: copy.missions.types.quiz }));
    fireEvent.click(screen.getByRole("checkbox", { name: copy.missions.types.keyword }));
    ask();
    expect(screen.getByRole("alert")).toHaveTextContent(s.errors["invalid-types"]);
    expect(suggest).not.toHaveBeenCalled();
  });

  it.each(["not-configured", "quota", "rate-limited", "empty"] as const)("explains a %s answer", async (code) => {
    renderView(vi.fn(async () => ({ ok: false as const, code })));

    ask();

    expect(await screen.findByRole("alert")).toHaveTextContent(s.errors[code]);
  });

  it("treats an action that throws as an unknown failure", async () => {
    renderView(vi.fn(async () => { throw new Error("x"); }));
    ask();
    expect(await screen.findByRole("alert")).toHaveTextContent(s.errors.unknown);
  });

  it("opens a proposal in the mission form, prefilled, and goes back to the proposals", async () => {
    renderView();
    ask();

    fireEvent.click((await screen.findAllByRole("button", { name: s.review }))[1]);

    expect(screen.getByLabelText(copy.admin.missions.form.title)).toHaveValue("Clave estelar");
    expect(screen.getByLabelText(copy.admin.missions.form.id)).toHaveValue("ai-clave");
    expect(screen.getByLabelText(copy.admin.missions.form.keywords)).toHaveValue("red neuronal, gemini");
    expect(screen.getByLabelText(copy.admin.missions.form.type)).toHaveValue("keyword");
    fireEvent.click(screen.getByRole("button", { name: s.backToResults }));
    await waitFor(() => expect(screen.getByRole("list", { name: s.resultsLabel })).toBeInTheDocument());
  });

  it("has no detectable accessibility violations, before and after asking", async () => {
    const { container } = render(<SuggestMissionsView quadrants={QUADRANTS} checkpoints={{ talk: [], stand: [] }} suggest={vi.fn(async () => ({ ok: true as const, suggestions: [QUIZ] }))} save={vi.fn()} upload={vi.fn()} listHref="/x" />);
    expect((await axe(container)).violations).toEqual([]);

    ask();
    await screen.findByRole("list", { name: s.resultsLabel });
    expect((await axe(container)).violations).toEqual([]);
  });
});
