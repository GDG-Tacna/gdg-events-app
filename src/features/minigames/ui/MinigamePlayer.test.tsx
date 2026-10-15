// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { MinigameOffer } from "../domain/plays";
import type { GameProps } from "./games/shared";
import { MinigameOfferCard } from "./MinigameOfferCard";
import { MinigamePlayer, type MinigamePlayerProps } from "./MinigamePlayer";
import type { FinishMinigameAction, StartMinigameAction } from "./play-actions";

const t = copy.minigames;
const OFFER: MinigameOffer = { gameId: "circuits", difficulty: "normal", state: "available", xpBonus: 40 };
const TICKET = { ok: true as const, gameId: "circuits" as const, difficulty: "hard" as const, expiresAt: 0, codeLanguages: ["python" as const] };

/** A stand-in game: shows what it received and offers to win or lose. */
const seen: GameProps[] = [];
function FakeGame(props: GameProps) {
  seen.push(props);
  return (
    <div>
      <p>{`juego ${props.difficulty} ${props.codeLanguages.join(",")}${props.paused ? " en pausa" : ""}`}</p>
      <button type="button" onClick={() => props.onFinish(true)}>
        ganar
      </button>
      <button type="button" onClick={() => props.onFinish(false)}>
        perder
      </button>
      <button
        type="button"
        onClick={() => {
          props.onFinish(true);
          props.onFinish(true);
        }}
      >
        doble
      </button>
    </div>
  );
}

function setup(overrides: Partial<MinigamePlayerProps> = {}) {
  const props: MinigamePlayerProps = {
    missionId: "ai-quiz",
    offer: OFFER,
    start: vi.fn<StartMinigameAction>(async () => TICKET),
    finish: vi.fn<FinishMinigameAction>(async ({ won }) => (won ? { ok: true, status: "won", xpBonus: 40, achievements: [{ id: "b", name: "Primer salto", tone: "lime" }] } : { ok: true, status: "lost", xpBonus: 0, achievements: [] })),
    backHref: "/missions/ai-quiz",
    achievementsHref: "/achievements",
    games: { circuits: FakeGame },
    ...overrides,
  };
  const view = render(<MinigamePlayer {...props} />);
  return { props, view };
}

const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

async function play() {
  fireEvent.click(screen.getByRole("button", { name: t.intro.start }));
  await advance(0);
  // One timer per step of the countdown.
  for (let step = 0; step < 3; step += 1) await advance(1000);
}

beforeEach(() => {
  seen.length = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MinigamePlayer", () => {
  it("introduces the game with its difficulty, the reward and the single attempt", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: t.names.circuits })).toBeInTheDocument();
    expect(screen.getByText(t.difficulty.normal)).toBeInTheDocument();
    expect(screen.getByText("Si ganas: +40 XP")).toBeInTheDocument();
    expect(screen.getByText(t.howTo.circuits)).toBeInTheDocument();
    expect(screen.getByText(t.intro.oneTry)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.intro.back })).toHaveAttribute("href", "/missions/ai-quiz");
  });

  it("asks for the ticket, counts down 3-2-1 and plays at the ticket's difficulty", async () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole("button", { name: t.intro.start }));
    await advance(0);
    expect(props.start).toHaveBeenCalledWith({ missionId: "ai-quiz" });
    expect(screen.getByText("3")).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("2")).toBeInTheDocument();
    await advance(1000);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/juego/)).not.toBeInTheDocument();
    await advance(1000);

    expect(screen.getByText("juego hard python")).toBeInTheDocument();
  });

  it("sends a win once and celebrates it with the XP and the badges", async () => {
    const { props } = setup();
    await play();

    fireEvent.click(screen.getByRole("button", { name: "ganar" }));
    await advance(0);

    expect(props.finish).toHaveBeenCalledTimes(1);
    expect(props.finish).toHaveBeenCalledWith({ missionId: "ai-quiz", won: true });
    expect(screen.getByRole("heading", { name: t.result.won })).toHaveFocus();
    expect(screen.getByText("+40 XP Estelar")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: copy.achievements.unlocked.label })).toHaveTextContent("Primer salto");
    expect(screen.getByRole("link", { name: t.result.back })).toHaveAttribute("href", "/missions/ai-quiz");
  });

  it("sends a result once even if the game reports it twice, and shows the XP the server paid", async () => {
    const { props } = setup({ finish: vi.fn<FinishMinigameAction>(async () => ({ ok: true, status: "won", xpBonus: 55, achievements: [] })) });
    await play();

    fireEvent.click(screen.getByRole("button", { name: "doble" }));
    await advance(0);

    expect(props.finish).toHaveBeenCalledTimes(1);
    expect(screen.getByText("+55 XP Estelar")).toBeInTheDocument();
  });

  it("tells a loss that the base XP stays", async () => {
    setup();
    await play();

    fireEvent.click(screen.getByRole("button", { name: "perder" }));
    await advance(0);

    expect(screen.getByRole("heading", { name: t.result.lost })).toBeInTheDocument();
    expect(screen.getByText("Conservas tus 40 XP de la misión.")).toBeInTheDocument();
  });

  it("pauses the game while the tab is hidden, until the attendee continues", async () => {
    setup();
    await play();
    screen.getByText("juego hard python");

    // Coming back to the tab alone does not pause.
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });

    expect(screen.getByText("juego hard python en pausa")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: t.paused.title });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.paused.resume }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("juego hard python")).toBeInTheDocument();
  });

  it("explains a refused ticket and stays on the intro", async () => {
    setup({ start: vi.fn<StartMinigameAction>().mockResolvedValueOnce({ ok: false, code: "already-played" }).mockRejectedValueOnce(new Error("offline")) });

    fireEvent.click(screen.getByRole("button", { name: t.intro.start }));
    await advance(0);
    expect(screen.getByText(t.errors["already-played"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.intro.start })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.intro.start }));
    await advance(0);
    expect(screen.getByText(t.errors.unknown)).toBeInTheDocument();
  });

  it("keeps the result when it could not be sent, and sends it again on request", async () => {
    const finish = vi.fn<FinishMinigameAction>().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, status: "won", xpBonus: 40, achievements: [] });
    setup({ finish });
    await play();

    fireEvent.click(screen.getByRole("button", { name: "ganar" }));
    await advance(0);
    expect(screen.getByText(t.errors.unknown)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.result.retry }));
    await advance(0);

    expect(finish.mock.calls.map(([input]) => input.won)).toEqual([true, true]);
    expect(screen.getByRole("heading", { name: t.result.won })).toBeInTheDocument();
  });

  it("continues a running attempt instead of offering a new one", () => {
    setup({ offer: { ...OFFER, state: "in-play" } });

    expect(screen.getByText(t.offer.inPlay)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.offer.continue })).toBeInTheDocument();
  });

  it("does not start a game that is not built yet", () => {
    const { props } = setup({ offer: { ...OFFER, gameId: "bug-kong" } });

    expect(screen.getByText(t.errors["not-available"])).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.intro.start })).not.toBeInTheDocument();
    expect(props.start).not.toHaveBeenCalled();
  });

  it("has no detectable violations on the intro", async () => {
    vi.useRealTimers();
    const { view } = setup();

    expect((await axe(view.container)).violations).toEqual([]);
  });
});

describe("MinigameOfferCard", () => {
  it("offers to play with the XP at stake, and to continue a running attempt", () => {
    const first = render(<MinigameOfferCard offer={OFFER} playHref="/minigame/ai-quiz" />);
    expect(screen.getByRole("region", { name: t.offer.label })).toHaveTextContent(t.names.circuits);
    expect(screen.getByText("Gana el mini-juego y suma otros 40 XP. Tienes un solo intento.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.offer.play })).toHaveAttribute("href", "/minigame/ai-quiz");
    first.unmount();

    render(<MinigameOfferCard offer={{ ...OFFER, state: "in-play" }} playHref="/minigame/ai-quiz" />);
    expect(screen.getByRole("link", { name: t.offer.continue })).toHaveAttribute("href", "/minigame/ai-quiz");
  });

  it("shows how a used attempt went, without a link", () => {
    const won = render(<MinigameOfferCard offer={{ ...OFFER, state: "won" }} playHref="/x" />);
    expect(screen.getByText("Ganaste el bonus: +40 XP")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    won.unmount();

    render(<MinigameOfferCard offer={{ ...OFFER, state: "lost" }} playHref="/x" />);
    expect(screen.getByText(t.offer.lost)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
