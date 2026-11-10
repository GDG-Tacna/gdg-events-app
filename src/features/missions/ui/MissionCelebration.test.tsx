// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { BoardMission, MissionBoard } from "../domain/use-cases";
import { MissionBoardView, type BoardQuadrant } from "./MissionBoardView";
import { CelebratedSummary } from "./MissionCelebration";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/missions" }));

const mission = (id: string, extra: Partial<BoardMission> = {}): BoardMission => ({
  id,
  title: `Misión ${id}`,
  description: "",
  quadrantId: "ai",
  type: "talk",
  xp: 50,
  credits: 0,
  config: { type: "talk" },
  status: "open",
  xpEarned: 0,
  creditsEarned: 0,
  attemptsLeft: null,
  minigame: null,
  ...extra,
});

const QUADRANTS: BoardQuadrant[] = [{ id: "ai", name: "AI", planet: "ai" }];
// Two done before the scan, two just completed by it, one still open: 4 of 5, 180 XP and 20 G-Credits in all.
const BOARD: MissionBoard = {
  missions: [
    mission("before-1", { status: "completed", xpEarned: 30 }),
    mission("before-2", { status: "completed", xpEarned: 50 }),
    mission("just-1", { status: "completed", xpEarned: 50, creditsEarned: 10 }),
    mission("just-2", { status: "completed", xpEarned: 50, creditsEarned: 10 }),
    mission("open-1"),
  ],
  completed: 4,
  total: 5,
  xpEarned: 180,
  creditsEarned: 20,
};

const renderBoard = (celebrate?: readonly string[]) => render(<MissionBoardView board={BOARD} quadrants={QUADRANTS} missionHref={(id) => `/missions/${id}`} celebrate={celebrate} />);

beforeEach(() => {
  router.replace.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a board that celebrates what a scan completed", () => {
  it("stamps only the completed missions it was told about, ignoring ids that are open, unknown or malformed", () => {
    renderBoard(["just-1", "open-1", "ghost", "before-1"]);

    const stamps = screen.getAllByText(copy.missions.celebratedTag);
    // `before-1` is completed too, so the address can celebrate it: only open and unknown ids are ignored.
    expect(stamps).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "Misión open-1" }).closest("li")).not.toHaveTextContent(copy.missions.celebratedTag);
  });

  it("shows no stamp and keeps the plain summary when nothing is celebrated", () => {
    renderBoard();

    expect(screen.queryByText(copy.missions.celebratedTag)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: copy.missions.summaryLabel })).toHaveAttribute("aria-valuenow", "4");
  });

  it("names each celebrated mission to screen readers", () => {
    renderBoard(["just-1", "just-2"]);

    const status = screen.getByRole("status");
    expect(within(status).getByText("Misión cumplida: Misión just-1")).toBeInTheDocument();
    expect(within(status).getByText("Misión cumplida: Misión just-2")).toBeInTheDocument();
  });

  it("scrolls to the first celebrated card only", () => {
    renderBoard(["just-1", "just-2"]);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("counts the summary up from what the cadet had before the scan to the new total", async () => {
    renderBoard(["just-1", "just-2"]);

    // First frame: before the scan (2 of 5, 80 XP, no credits yet).
    expect(screen.getByText("2 de 5 misiones")).toBeInTheDocument();
    expect(screen.getByText(/\+80 XP/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("4 de 5 misiones")).toBeInTheDocument(), { timeout: 4000 });
    await waitFor(() => expect(screen.getByText(/\+180 XP/)).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByText(/\+20 G-Credits/)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations while celebrating", async () => {
    const { container } = renderBoard(["just-1"]);

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("CelebratedSummary", () => {
  const props = { done: 4, total: 5, xp: 180, credits: 20, gained: { missions: 2, xp: 100, credits: 20 }, titles: ["Misión just-1"] };

  it("cleans the address after a few seconds, so a refresh does not replay it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<CelebratedSummary {...props} />);

    expect(router.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(router.replace).toHaveBeenCalledWith("/missions", { scroll: false });
  });

  it("does not clean the address if the person leaves first", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const view = render(<CelebratedSummary {...props} />);

    view.unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(router.replace).not.toHaveBeenCalled();
  });
});
