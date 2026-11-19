// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardWire, CounterWire } from "../domain/layers";
import { LayersProgram } from "./LayersProgram";
import { channelPair } from "./test-helpers";

const NOW = 1_700_000_000_000;
const counter = (overrides: Partial<CounterWire> = {}): CounterWire => ({ visible: true, remainingMs: 272_000, running: false, sentAt: NOW, x: 98, y: 3, size: "sm", label: "", ...overrides });
const SPEAKER: CardWire = { id: "card-0001", kind: "speaker", title: "Luis Eduardo", text: "Agente de IA con Genkit", link: "", x: 4, y: 90 };
const NOTICE: CardWire = { id: "card-0002", kind: "notice", title: "Almuerzo en el patio", text: "Muestra tu QR en la puerta.", link: "gdgtacna.com/menu", x: 98, y: 3 };

function setup() {
  const lines = channelPair();
  const view = render(<LayersProgram openChannel={() => lines.stage} />);
  const say = (cardsAndCounter: { counter: CounterWire; cards: CardWire[] }) =>
    act(async () => {
      lines.console.post({ type: "layers", ...cardsAndCounter });
      for (let round = 0; round < 4; round += 1) await Promise.resolve();
    });
  return { say, view };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("LayersProgram", () => {
  it("draws nothing until the console shows something, and nothing when it shows nothing", async () => {
    const { say, view } = setup();
    expect(view.container).toBeEmptyDOMElement();

    await say({ counter: counter({ visible: false }), cards: [] });
    expect(view.container).toBeEmptyDOMElement();
  });

  it("draws the counter where the console put it, over everything and out of the way of clicks", async () => {
    const { say } = setup();
    await say({ counter: counter({ x: 30, y: 60 }), cards: [] });

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("04:32");
    expect(timer).toHaveStyle({ left: "30%", top: "60%" });
    // It hangs from the corner its place names, so it can sit at any edge without leaving the screen.
    expect(timer.style.transform).toBe("translate(-30%, -60%)");
    expect(screen.getByTestId("layers").className).toContain("pointer-events-none");
  });

  it("counts down by itself between messages, and stays where it is when paused", async () => {
    const { say } = setup();
    await say({ counter: counter({ running: true, remainingMs: 10_000, sentAt: NOW }), cards: [] });
    expect(screen.getByRole("timer")).toHaveTextContent("00:10");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:07");

    await say({ counter: counter({ running: false, remainingMs: 7000, sentAt: NOW + 3000 }), cards: [] });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:07");
  });

  it("never shows less than zero", async () => {
    const { say } = setup();
    await say({ counter: counter({ running: true, remainingMs: 1000, sentAt: NOW }), cards: [] });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  });

  it("draws a big counter over the whole screen, dimmed, with its text", async () => {
    const { say } = setup();
    await say({ counter: counter({ size: "lg", label: "Empezamos en", remainingMs: 299_000 }), cards: [] });

    expect(screen.getByRole("timer")).toHaveTextContent("04:59");
    expect(screen.getByText("Empezamos en")).toBeInTheDocument();
    expect(screen.getByRole("timer").className).toContain("inset-0");
  });

  it("draws the cards that are shown: a speaker and a notice with its link, each at its place", async () => {
    const { say } = setup();
    await say({ counter: counter({ visible: false }), cards: [SPEAKER, NOTICE] });

    expect(screen.getByText("Luis Eduardo")).toBeInTheDocument();
    expect(screen.getByText("PONENTE")).toBeInTheDocument();
    expect(screen.getByText("Agente de IA con Genkit")).toBeInTheDocument();
    expect(screen.getByText("AVISO")).toBeInTheDocument();
    expect(screen.getByText("gdgtacna.com/menu")).toBeInTheDocument();
    expect(screen.getByText("Luis Eduardo").closest("div[style]")).toHaveStyle({ left: "4%", top: "90%" });
  });

  it("takes a card away when the console stops sending it", async () => {
    const { say } = setup();
    await say({ counter: counter({ visible: false }), cards: [SPEAKER] });
    expect(screen.getByText("Luis Eduardo")).toBeInTheDocument();

    await say({ counter: counter({ visible: false }), cards: [] });
    expect(screen.queryByText("Luis Eduardo")).not.toBeInTheDocument();
  });
});
