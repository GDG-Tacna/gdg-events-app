// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { StageRaffle } from "../../domain/stage";
import { REEL_MS, RaffleScreen } from "./stage-parts";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (original) => ({ ...(await original<typeof import("framer-motion")>()), useReducedMotion: () => motion.reduce }));

const t = copy.stage.raffle;
const RAFFLE: StageRaffle = {
  drawId: "polera-1",
  prizeName: "Polera DevFest",
  prizeImageUrl: null,
  winner: { alias: "Nova_7", squad: "Escuadrón Firebase" },
  tickets: 12,
  totalTickets: 480,
  reel: ["Orion", "Lyra", "Vega", "Nova_7"],
  at: new Date(),
};
const reel = () => screen.getByTestId("raffle-reel");

describe("RaffleScreen", () => {
  beforeEach(() => {
    motion.reduce = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => vi.useRealTimers());

  it("gives the big winner name its own line height (cn would drop one written before the font size, clipping it)", () => {
    render(<RaffleScreen raffle={RAFFLE} />);

    expect(reel()).toHaveClass("leading-[1.2]");
  });

  it("shows the prize's photo above its name when it has one", () => {
    const { container, unmount } = render(<RaffleScreen raffle={{ ...RAFFLE, prizeImageUrl: "https://cdn/polera.webp" }} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn/polera.webp");
    unmount();

    const { container: without } = render(<RaffleScreen raffle={RAFFLE} />);
    expect(without.querySelector("img")).toBeNull();
  });

  it("spins through the names, slowing down, and lands on the winner with their tickets", async () => {
    render(<RaffleScreen raffle={RAFFLE} />);

    expect(screen.getByRole("heading", { name: "Polera DevFest" })).toBeInTheDocument();
    expect(reel()).toHaveTextContent("Orion");
    expect(screen.getByText(t.spinning, { selector: "p:not(.sr-only)" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.spinning);

    // The first step is the shortest: a sixth of the time for three steps.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REEL_MS / 6 + 1);
    });
    expect(reel()).toHaveTextContent("Lyra");
    expect(screen.queryByText(/de 480 boletos/)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REEL_MS);
    });
    expect(reel()).toHaveTextContent("Nova_7");
    expect(screen.getByText(/12 de 480 boletos/)).toBeInTheDocument();
    expect(screen.getByText(/Escuadrón Firebase/)).toBeInTheDocument();
    // Screen readers hear the result once.
    expect(screen.getByRole("status")).toHaveTextContent(`${t.winner} Nova_7, Polera DevFest`);
  });

  it("shows the winner at once with reduced motion", () => {
    motion.reduce = true;
    render(<RaffleScreen raffle={RAFFLE} />);

    expect(reel()).toHaveTextContent("Nova_7");
    expect(screen.getByText(/12 de 480 boletos/)).toBeInTheDocument();
  });

  it("shows the winner alone when there is no one else to spin through", () => {
    render(<RaffleScreen raffle={{ ...RAFFLE, reel: [], winner: { alias: "Solo", squad: null } }} />);

    expect(reel()).toHaveTextContent("Solo");
    expect(screen.getByText(new RegExp(copy.stage.noSquad))).toBeInTheDocument();
  });

  it("stops its timers when it goes away", () => {
    const { unmount } = render(<RaffleScreen raffle={RAFFLE} />);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("has no detectable accessibility violations once landed", async () => {
    vi.useRealTimers();
    motion.reduce = true;
    const { container } = render(<RaffleScreen raffle={RAFFLE} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
