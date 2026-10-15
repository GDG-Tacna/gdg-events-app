// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { Circuits } from "./circuits/Circuits";
import { generatePuzzle } from "./circuits/logic";
import { CodeOrder } from "./code-order/CodeOrder";
import { flatLines, pickSnippets } from "./code-order/logic";
import { WarpTiming } from "./warp-timing/WarpTiming";
import { WARP_CONFIG, jumpParams, zoneCenter } from "./warp-timing/logic";

const t = copy.minigames;

/** The same random sequence every time, so the board and the snippets are known. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WarpTiming", () => {
  /** A clock the test moves: the marker is where the time says, not where the screen drew it. */
  const clock = () => {
    let ms = 0;
    return { now: () => ms, set: (value: number) => (ms = value) };
  };
  // With random always 0.5 the zone is centred; at speed s the marker reaches 0.5 after 1 / (4s) seconds.
  const toCentre = (speed: number) => 1000 / (4 * speed);

  it("wins with enough jumps inside the zone, and says so once", async () => {
    const time = clock();
    const onFinish = vi.fn();
    render(<WarpTiming difficulty="easy" codeLanguages={[]} paused={false} onFinish={onFinish} random={() => 0.5} now={time.now} />);
    await advance(0);

    // Each jump starts when the previous one is tapped.
    let start = 0;
    for (let jump = 0; jump < WARP_CONFIG.easy.needed; jump += 1) {
      start += toCentre(jumpParams(WARP_CONFIG.easy, jump).speed);
      time.set(start);
      fireEvent.click(screen.getByRole("button", { name: t.warp.jump }));
      if (jump === 0) expect(screen.getByText(t.warp.hit)).toBeInTheDocument();
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("loses once enough jumps miss that the target is out of reach", async () => {
    const time = clock();
    const onFinish = vi.fn();
    render(<WarpTiming difficulty="normal" codeLanguages={[]} paused={false} onFinish={onFinish} random={() => 0.5} now={time.now} />);
    await advance(0);

    fireEvent.click(screen.getByRole("button", { name: t.warp.jump }));
    expect(screen.getByText(t.warp.miss)).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t.warp.jump }));

    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it("counts the jumps and the hits needed", async () => {
    render(<WarpTiming difficulty="normal" codeLanguages={[]} paused={false} onFinish={vi.fn()} random={() => 0.5} now={() => 0} />);
    await advance(0);

    expect(screen.getByText("Salto 1 de 5")).toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(zoneCenter(0.2, 0.5)).toBe(0.5);
  });

  it("loses when the time runs out, and stands still while paused", async () => {
    const onFinish = vi.fn();
    const { rerender } = render(<WarpTiming difficulty="normal" codeLanguages={[]} paused={false} onFinish={onFinish} now={() => 0} />);
    await advance(20_000);
    rerender(<WarpTiming difficulty="normal" codeLanguages={[]} paused onFinish={onFinish} now={() => 0} />);
    await advance(60_000);
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: t.warp.jump })).toBeDisabled();

    rerender(<WarpTiming difficulty="normal" codeLanguages={[]} paused={false} onFinish={onFinish} now={() => 0} />);
    await advance(10_000);
    expect(onFinish).toHaveBeenCalledWith(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("Circuits", () => {
  it("lights what is connected and wins when the energy reaches the core", async () => {
    const { board, solution } = generatePuzzle(4, seeded(5));
    const onFinish = vi.fn();
    render(<Circuits difficulty="easy" codeLanguages={[]} paused={false} onFinish={onFinish} random={seeded(5)} />);
    await advance(0);

    const tiles = within(screen.getByRole("group", { name: t.circuits.boardLabel })).getAllByRole("button");
    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toHaveAccessibleName(/^Pieza fila 1, columna 1/);

    // Turn each piece until it has the rotation of the solution.
    board.tiles.forEach((tile, index) => {
      const turns = (solution[index] - tile.rotation + 4) % 4;
      for (let turn = 0; turn < turns && onFinish.mock.calls.length === 0; turn += 1) fireEvent.click(tiles[index]);
    });

    expect(onFinish).toHaveBeenCalledWith(true);
    expect(within(screen.getByRole("group", { name: t.circuits.boardLabel })).getAllByRole("button", { name: /con energía/ }).length).toBeGreaterThan(0);
  });

  it("loses when the time runs out", async () => {
    const onFinish = vi.fn();
    render(<Circuits difficulty="hard" codeLanguages={[]} paused={false} onFinish={onFinish} random={seeded(9)} />);

    await advance(39_900);
    expect(onFinish).not.toHaveBeenCalled();
    await advance(200);
    expect(onFinish).toHaveBeenCalledWith(false);
  });
});

describe("CodeOrder", () => {
  const lineButtons = () => within(screen.getByRole("region", { name: t.code.lines })).getAllByRole("button");

  it("builds three snippets line by line and wins", async () => {
    const snippets = pickSnippets("easy", ["javascript"], seeded(3));
    const onFinish = vi.fn();
    render(<CodeOrder difficulty="easy" codeLanguages={["javascript"]} paused={false} onFinish={onFinish} random={seeded(3)} />);
    await advance(0);

    snippets.forEach((snippet, round) => {
      expect(screen.getByText(`Fragmento ${round + 1} de 3`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: snippet.title })).toBeInTheDocument();
      for (const line of flatLines(snippet)) fireEvent.click(lineButtons().find((button) => button.textContent === line)!);
    });

    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("counts a wrong line as a mistake, and loses after too many", async () => {
    const snippet = pickSnippets("hard", ["python"], seeded(4))[0];
    const onFinish = vi.fn();
    render(<CodeOrder difficulty="hard" codeLanguages={["python"]} paused={false} onFinish={onFinish} random={seeded(4)} />);
    await advance(0);
    const last = flatLines(snippet).at(-1)!;

    fireEvent.click(lineButtons().find((button) => button.textContent === last)!);
    expect(screen.getByText(t.code.wrong)).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    fireEvent.click(lineButtons().find((button) => button.textContent === last)!);
    expect(onFinish).toHaveBeenCalledWith(false);

    // The time running out afterwards does not report a second result.
    await advance(40_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("moves a right line into the program and takes it off the list", async () => {
    const snippet = pickSnippets("normal", ["javascript", "python"], seeded(8))[0];
    render(<CodeOrder difficulty="normal" codeLanguages={["javascript", "python"]} paused={false} onFinish={vi.fn()} random={seeded(8)} />);
    await advance(0);
    const first = flatLines(snippet)[0];

    fireEvent.click(lineButtons().find((button) => button.textContent === first)!);

    expect(within(screen.getByRole("region", { name: t.code.program })).getByText(first.trim())).toBeInTheDocument();
    expect(lineButtons()).toHaveLength(4);
  });

  it("loses when the time runs out", async () => {
    const onFinish = vi.fn();
    render(<CodeOrder difficulty="hard" codeLanguages={["javascript"]} paused={false} onFinish={onFinish} random={seeded(2)} />);

    await advance(35_100);
    expect(onFinish).toHaveBeenCalledWith(false);
  });
});

describe("games accessibility", () => {
  it("has no detectable violations in any of the three games", async () => {
    vi.useRealTimers();
    for (const game of [
      <WarpTiming key="warp" difficulty="normal" codeLanguages={[]} paused={false} onFinish={vi.fn()} now={() => 0} />,
      <Circuits key="circuits" difficulty="normal" codeLanguages={[]} paused={false} onFinish={vi.fn()} random={seeded(1)} />,
      <CodeOrder key="code" difficulty="normal" codeLanguages={["python"]} paused={false} onFinish={vi.fn()} random={seeded(1)} />,
    ]) {
      const view = render(game);
      expect((await axe(view.container)).violations).toEqual([]);
      view.unmount();
    }
  });
});
