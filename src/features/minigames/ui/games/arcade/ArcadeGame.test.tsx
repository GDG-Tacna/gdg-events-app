// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { BugInvaders, drawInvaders } from "../bug-invaders/BugInvaders";
import { createInvaders } from "../bug-invaders/simulation";
import { BugKong, drawKong } from "../bug-kong/BugKong";
import { createKong } from "../bug-kong/simulation";
import { ArcadeGame } from "./ArcadeGame";
import { NO_INPUT, type ArcadeInput, type ArcadeStatus } from "./engine";

const t = copy.minigames;

interface Toy {
  status: ArcadeStatus;
  time: number;
  lives: number;
  seen: ArcadeInput[];
}

/** Frames run only when the test says so, with a clock it moves. */
function frames() {
  const queue: Array<() => void> = [];
  let ms = 0;
  return {
    now: () => ms,
    requestFrame: (callback: () => void) => queue.push(callback),
    cancelFrame: vi.fn(),
    run: (count: number, stepMs = 50) =>
      act(() => {
        for (let i = 0; i < count; i += 1) {
          ms += stepMs;
          queue.shift()?.();
        }
      }),
  };
}

const fakeContext = () => ({ fillRect: vi.fn(), set fillStyle(_value: string) {}, imageSmoothingEnabled: true });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => fakeContext() as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderToy(overrides: { paused?: boolean; finishAt?: { time: number; status: ArcadeStatus }; seconds?: number } = {}) {
  const clock = frames();
  const onFinish = vi.fn();
  const draw = vi.fn();
  const step = vi.fn((state: Toy, input: ArcadeInput, dt: number): Toy => {
    const time = state.time + dt;
    const status = overrides.finishAt && time >= overrides.finishAt.time ? overrides.finishAt.status : "playing";
    return { ...state, time, status, lives: input.left ? 1 : 3, seen: [...state.seen, input] };
  });
  const create = () => ({ status: "playing" as const, time: 0, lives: 3, seen: [] });
  const view = render(
    <ArcadeGame<Toy>
      create={create}
      step={step}
      draw={draw}
      seconds={overrides.seconds ?? 30}
      controls={["left", "right", "action"]}
      label="Juego de prueba"
      paused={overrides.paused ?? false}
      onFinish={onFinish}
      now={clock.now}
      requestFrame={clock.requestFrame}
      cancelFrame={clock.cancelFrame}
    />,
  );
  return { clock, onFinish, draw, step, view };
}

describe("ArcadeGame", () => {
  it("steps and draws on every frame, and shows the time left and the lives", async () => {
    const { clock, draw, step } = renderToy();

    await clock.run(20);

    expect(step).toHaveBeenCalledTimes(20);
    expect(draw).toHaveBeenCalledTimes(20);
    expect(screen.getByRole("timer", { name: t.hud.timeLabel })).toHaveTextContent("29 s");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Juego de prueba" })).toBeInTheDocument();
  });

  it("never steps more than a short slice, even after a long frame", async () => {
    const { clock, step } = renderToy();

    await clock.run(1, 5000);

    expect(step.mock.calls[0][2]).toBeCloseTo(0.05);
  });

  it("holds a direction while its button is pressed, and uses a jump once", async () => {
    const { clock, step } = renderToy();

    fireEvent.pointerDown(screen.getByRole("button", { name: t.controls.left }));
    fireEvent.pointerDown(screen.getByRole("button", { name: t.controls.action }));
    await clock.run(2);
    fireEvent.pointerUp(screen.getByRole("button", { name: t.controls.left }));
    await clock.run(1);

    const inputs = step.mock.calls.map(([, input]) => input);
    expect(inputs[0]).toEqual({ ...NO_INPUT, left: true, action: true });
    expect(inputs[1]).toEqual({ ...NO_INPUT, left: true });
    expect(inputs[2]).toEqual(NO_INPUT);
  });

  it("takes the same input from the arrow keys and the space bar", async () => {
    const { clock, step } = renderToy();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: " " });
    await clock.run(1);
    fireEvent.keyUp(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "a" });
    await clock.run(1);

    expect(step.mock.calls[0][1]).toEqual({ ...NO_INPUT, right: true, action: true });
    expect(step.mock.calls[1][1]).toEqual(NO_INPUT);
  });

  it("reports the result once and stops", async () => {
    const { clock, onFinish, step } = renderToy({ finishAt: { time: 0.2, status: "won" } });

    await clock.run(10);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(true);
    expect(step).toHaveBeenCalledTimes(4);
  });

  it("reports a loss", async () => {
    const { clock, onFinish } = renderToy({ finishAt: { time: 0.1, status: "lost" } });

    await clock.run(5);

    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it("does not move while paused, and disables the controls", async () => {
    const { clock, step } = renderToy({ paused: true });

    await clock.run(10);

    expect(step).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: t.controls.left })).toBeDisabled();
  });

  it("has no detectable violations", async () => {
    const { view } = renderToy();

    expect((await axe(view.container)).violations).toEqual([]);
  });
});

describe("the two games on the arcade frame", () => {
  it("gives Invasores de bugs left and right, and Bug Kong all five controls", () => {
    const first = render(<BugInvaders difficulty="normal" codeLanguages={[]} paused onFinish={vi.fn()} />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([t.controls.left, t.controls.right]);
    expect(screen.getByRole("img", { name: t.invaders.label })).toBeInTheDocument();
    first.unmount();

    render(<BugKong difficulty="normal" codeLanguages={[]} paused onFinish={vi.fn()} />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([t.controls.left, t.controls.up, t.controls.action, t.controls.down, t.controls.right]);
    expect(screen.getByRole("img", { name: t.kong.label })).toBeInTheDocument();
  });

  it("draws every part of a frame", () => {
    const context = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
    drawInvaders(context, { ...createInvaders("easy"), shots: [{ x: 10, y: 10 }], errors: [{ x: 20, y: 20 }] }, 2);
    expect((context.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(100);

    const kongContext = { fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D;
    drawKong(kongContext, createKong("easy"), 2);
    expect((kongContext.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(100);
  });
});
