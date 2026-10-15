// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { formatNumber } from "@/shared/lib/format";
import { axe } from "@/test-utils/axe";
import type { BoardMission, MissionBoard } from "../domain/use-cases";
import { MissionBoardView, type BoardQuadrant } from "./MissionBoardView";

const mission = (id: string, quadrantId: string, extra: Partial<BoardMission> = {}): BoardMission => ({
  id,
  title: `Misión ${id}`,
  description: `Descripción ${id}`,
  quadrantId,
  type: "stand",
  xp: 30,
  credits: 10,
  config: { type: "stand" },
  status: "open",
  xpEarned: 0,
  creditsEarned: 0,
  attemptsLeft: null,
  minigame: null,
  ...extra,
});

const QUADRANTS: BoardQuadrant[] = [
  { id: "cloud", name: "Google Cloud", planet: "cloud" },
  { id: "ai", name: "AI", planet: "ai" },
  { id: "empty", name: "Vacío", planet: "gdg" },
];

const MISSIONS = [
  mission("ai-quiz", "ai", { type: "quiz", xp: 40, config: { type: "quiz", question: "¿Q?", options: ["a", "b"] }, status: "in-progress", attemptsLeft: 1 }),
  mission("cloud-stand", "cloud", { status: "completed", xpEarned: 30 }),
  mission("ai-keyword", "ai", { type: "keyword", xp: 1500, config: { type: "keyword", prompt: "Pide" } }),
  mission("ai-failed", "ai", { type: "quiz", xp: 40, config: { type: "quiz", question: "¿Q?", options: ["a", "b"] }, status: "failed", attemptsLeft: 0 }),
  mission("lost", "retired", { type: "talk", config: { type: "talk" } }),
];
const BOARD: MissionBoard = { missions: MISSIONS, completed: 1, total: 5, xpEarned: 30, creditsEarned: 10 };

const board = (missions: BoardMission[]): MissionBoard => ({ missions, completed: 0, total: missions.length, xpEarned: 0, creditsEarned: 0 });
const card = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li") as HTMLElement;

describe("MissionBoardView", () => {
  it("shows the overall progress and the XP earned in missions", () => {
    render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(screen.getByRole("heading", { level: 1, name: copy.missions.title })).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: copy.missions.summaryLabel });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuetext", "1 de 5 misiones");
    expect(screen.getByText(/XP ganado en misiones/).parentElement).toHaveTextContent("+30 XP");
  });

  it("groups missions by quadrant in the quadrants' order, skips empty quadrants, and keeps the rest under Otras misiones", () => {
    render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Google Cloud", "AI", copy.missions.otherQuadrant]);
    const ai = screen.getByRole("region", { name: "AI" });
    expect(within(ai).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Misión ai-quiz", "Misión ai-keyword", "Misión ai-failed"]);
    expect(within(ai).getByText("0 de 3")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Google Cloud" })).getByText("1 de 1")).toBeInTheDocument();
  });

  it("shows each mission's type, XP and status in words", () => {
    render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(card("Misión cloud-stand")).toHaveTextContent(copy.missions.types.stand);
    expect(card("Misión cloud-stand")).toHaveTextContent("Completada. Ganaste 30 XP");
    expect(card("Misión ai-quiz")).toHaveTextContent(copy.missions.types.quiz);
    expect(card("Misión ai-quiz")).toHaveTextContent("En curso. Te queda 1 intento");
    expect(card("Misión ai-keyword")).toHaveTextContent(`+${formatNumber(1500)} XP`);
    expect(card("Misión ai-keyword").textContent).toContain("Pendiente");
    expect(card("Misión ai-keyword").textContent).not.toContain("Pendiente. Pendiente");
    expect(card("Misión ai-failed")).toHaveTextContent("Sin XP");
    expect(card("Misión lost")).toHaveTextContent(copy.missions.types.talk);
    expect(card("Misión ai-quiz")).toHaveTextContent("Descripción ai-quiz");
  });

  it("opens each mission from its title, a link that covers the card", () => {
    render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(screen.getByRole("link", { name: "Misión ai-quiz" })).toHaveAttribute("href", "/missions/ai-quiz");
    expect(screen.getAllByRole("link")).toHaveLength(MISSIONS.length);
  });

  it("links to the edition's story only when it is on, named by its title when it has one", () => {
    const { unmount } = render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} odysseyHref="/odyssey" />);
    expect(screen.getByRole("link", { name: "Leer la historia" })).toHaveAttribute("href", "/odyssey");
    unmount();

    const named = render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} odysseyHref="/odyssey" odysseyTitle="Odisea de Código" />);
    expect(screen.getByRole("link", { name: "Leer «Odisea de Código»" })).toHaveAttribute("href", "/odyssey");
    named.unmount();

    render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);
    expect(screen.queryByRole("link", { name: copy.missions.odyssey })).not.toBeInTheDocument();
  });

  it("shows each mission's G-Credits next to its XP, and what was earned", () => {
    render(<MissionBoardView board={{ ...BOARD, missions: [{ ...MISSIONS[1], creditsEarned: 10 }], creditsEarned: 10 }} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(card("Misión cloud-stand")).toHaveTextContent("+10 G-Credits");
    expect(card("Misión cloud-stand")).toHaveTextContent("Ganaste 30 XP y 10 G-Credits");
    expect(screen.getByText(/G-Credits ganados en misiones/).parentElement).toHaveTextContent("+10 G-Credits");
  });

  it("shows no G-Credits on a mission that gives none, nor in the summary when none were earned", () => {
    render(<MissionBoardView board={{ ...BOARD, missions: [{ ...MISSIONS[1], credits: 0 }], creditsEarned: 0 }} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(screen.queryByText(/G-Credits/)).not.toBeInTheDocument();
  });

  it("counts several tries left in the plural", () => {
    render(<MissionBoardView board={{ ...BOARD, missions: [{ ...MISSIONS[0], attemptsLeft: 2 }] }} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(card("Misión ai-quiz")).toHaveTextContent("Te quedan 2 intentos");
  });

  it("says so when there are no active missions", () => {
    render(<MissionBoardView board={{ missions: [], completed: 0, total: 0, xpEarned: 0, creditsEarned: 0 }} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(screen.getByText(copy.missions.empty)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect((await axe(container)).violations).toEqual([]);
  });

  it("gives each card its type's icon, and its tags: type, quadrant and the mini-game only when the edition has it on", () => {
    render(
      <MissionBoardView
        board={board([mission("a", "cloud", { minigame: "circuits" }), mission("b", "cloud", { minigame: "warp-timing" }), mission("c", "lost")])}
        quadrants={QUADRANTS}
        missionHref={(id) => `/missions/${id}`}
        enabledGames={new Set(["circuits"])}
      />,
    );

    const tagsOf = (title: string) =>
      within(screen.getByRole("link", { name: title }).closest("li")!)
        .getByRole("list", { name: copy.missions.tags.label })
        .textContent;
    expect(tagsOf("Misión a")).toBe(`${copy.missions.types.stand}Google Cloud${copy.missions.tags.minigameBonus}${copy.missions.tags.minigame}`);
    // A game the edition switched off is not offered.
    expect(tagsOf("Misión b")).toBe(`${copy.missions.types.stand}Google Cloud`);
    // A mission whose quadrant is not on the plan has no quadrant tag.
    expect(tagsOf("Misión c")).toBe(copy.missions.types.stand);
  });

  it("shows a check instead of the type's icon once the mission is done", () => {
    const { container } = render(<MissionBoardView board={board([mission("a", "cloud", { status: "completed", xpEarned: 30 })])} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);

    expect(container.querySelector("li > div > span[aria-hidden='true'] svg.lucide-circle-check")).toBeInTheDocument();

    const open = render(<MissionBoardView board={board([mission("b", "cloud")])} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} />);
    expect(open.container.querySelector("li > div > span[aria-hidden='true'] svg.lucide-circle-check")).not.toBeInTheDocument();
    expect(open.container.querySelector("li > div > span[aria-hidden='true'] svg.lucide-map-pin")).toBeInTheDocument();
  });

  it("shows the mission's picture instead of the type's icon, with a check once it is done", () => {
    const { container } = render(
      <MissionBoardView
        board={board([mission("a", "cloud", { imageUrl: "https://cdn/a.webp" }), mission("b", "cloud", { imageUrl: "https://cdn/b.webp", status: "completed", xpEarned: 30 })])}
        quadrants={QUADRANTS}
        missionHref={(id) => `/missions/${id}`}
      />,
    );
    const tile = (title: string) => card(title).querySelector("span[aria-hidden='true']") as HTMLElement;

    expect(tile("Misión a").querySelector("img")).toHaveAttribute("src", "https://cdn/a.webp");
    expect(tile("Misión a").querySelector("svg")).toBeNull();
    expect(tile("Misión b").querySelector("img")).toHaveAttribute("src", "https://cdn/b.webp");
    expect(tile("Misión b").querySelector("svg.lucide-circle-check")).toBeInTheDocument();
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(2);
  });
});
