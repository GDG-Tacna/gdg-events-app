// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { RankingEntry } from "../../domain/ranking";
import { DEFAULT_STAGE, type StageState } from "../../domain/stage";
import type { StageFeed, StageFeedHandlers } from "../../domain/stage-feed";
import { StageScreen } from "./StageScreen";

// Without motion the tests see each frame at once (and the screen honours reduced motion the same way).
vi.mock("framer-motion", async (original) => ({ ...(await original<typeof import("framer-motion")>()), useReducedMotion: () => true }));

const t = copy.stage;
const SQUADS = [
  { id: "firebase", name: "Escuadrón Firebase", active: true },
  { id: "angular", name: "Escuadrón Angular", active: true },
];
const SPRITES = { firebase: { rows: ["x"], palette: { x: "#ffaa00" } } };
const INITIAL_BOARD = { cadets: [{ position: 1, alias: "Inicial", squad: null, xp: 10 }], squads: [] };
const entry = (alias: string, xp: number, squadId: string | null = null, minute = 0): RankingEntry => ({ uid: alias, alias, squadId, xp, reachedAt: new Date(Date.UTC(2026, 9, 24, 15, minute)) });

function fakeFeed() {
  let handlers: StageFeedHandlers | null = null;
  const stop = vi.fn();
  const feed: StageFeed = {
    subscribe: vi.fn((_eventId, next) => {
      handlers = next;
      return stop;
    }),
  };
  const push = (update: (h: StageFeedHandlers) => void) => act(() => update(handlers!));
  return { feed, push, stop };
}

function renderScreen(initialStage: StageState = DEFAULT_STAGE, alternateMs = 15_000) {
  const fake = fakeFeed();
  const view = render(<StageScreen eventId="e1" feed={fake.feed} squads={SQUADS} sprites={SPRITES} initialStage={initialStage} initialBoard={INITIAL_BOARD} alternateMs={alternateMs} />);
  return { ...view, ...fake };
}

describe("StageScreen", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("starts from the server's ranking, then follows the live participants", async () => {
    const { feed, push } = renderScreen({ ...DEFAULT_STAGE, view: "cadets" });
    expect(feed.subscribe).toHaveBeenCalledWith("e1", expect.anything());
    expect(screen.getByRole("list", { name: t.cadetsTitle })).toHaveTextContent("Inicial");

    await push((h) => {
      h.participants([entry("Orion", 300, "angular", 2), entry("Nova", 300, "firebase", 1), entry("Cero", 0, "firebase")]);
      h.status("live");
    });

    const rows = within(screen.getByRole("list", { name: t.cadetsTitle })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["1NovaEscuadrón Firebase300 XP", "2OrionEscuadrón Angular300 XP"]);
    expect(screen.getByRole("status")).toHaveTextContent(t.status.live);
    // A live ranking is never called final.
    expect(screen.queryByText(t.frozen)).not.toBeInTheDocument();
  });

  it("follows the admin's stage live: squads with their logo and members, the waiting screen, the reveal", async () => {
    const { push, container } = renderScreen();

    await push((h) => {
      h.participants([entry("Nova", 300, "firebase"), entry("Cero", 0, "firebase"), entry("Orion", 120, "angular")]);
      h.stage({ ...DEFAULT_STAGE, view: "squads" });
    });
    const squads = screen.getByRole("list", { name: t.squadsTitle });
    expect(within(squads).getAllByRole("listitem")[0]).toHaveTextContent("Escuadrón Firebase300 XP2 cadetes");
    expect(within(squads).getAllByRole("listitem")[1]).toHaveTextContent(/1 cadete$/);
    expect(container.querySelectorAll("svg[shape-rendering], svg").length).toBeGreaterThan(0);

    await push((h) => h.stage({ ...DEFAULT_STAGE, display: "waiting" }));
    expect(screen.getByText(t.waiting.body)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await push((h) => h.stage({ ...DEFAULT_STAGE, display: "reveal", champions: { cadet: { position: 1, alias: "Nova", squad: "Escuadrón Firebase", xp: 300 }, squad: null } }));
    expect(screen.getByRole("heading", { name: t.reveal.title })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: t.reveal.cadet })).toHaveTextContent("Nova");
    expect(screen.getByRole("region", { name: t.reveal.squad })).toHaveTextContent(t.reveal.none);
  });

  it("flashes a cadet who moves up, for a moment", async () => {
    const { push } = renderScreen({ ...DEFAULT_STAGE, view: "cadets" });
    await push((h) => h.participants([entry("Nova", 300), entry("Orion", 200), entry("Vega", 100)]));
    const row = (alias: string) => within(screen.getByRole("list", { name: t.cadetsTitle })).getByText(alias).closest("li");
    expect(row("Orion")).not.toHaveAttribute("data-climbed");

    await push((h) => h.participants([entry("Nova", 300), entry("Orion", 400), entry("Vega", 100)]));
    expect(row("Orion")).toHaveAttribute("data-climbed", "true");
    // Moving down or staying put is not a climb.
    expect(row("Nova")).not.toHaveAttribute("data-climbed");
    expect(row("Vega")).not.toHaveAttribute("data-climbed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(row("Orion")).not.toHaveAttribute("data-climbed");
  });

  it("shows a raffle draw the moment the admin draws it", async () => {
    const { push } = renderScreen();

    await push((h) =>
      h.stage({ ...DEFAULT_STAGE, display: "raffle", raffle: { drawId: "p-1", prizeName: "Polera", prizeImageUrl: null, winner: { alias: "Nova", squad: null }, tickets: 3, totalTickets: 90, reel: ["Orion", "Nova"], at: new Date() } }),
    );

    expect(screen.getByRole("heading", { name: "Polera" })).toBeInTheDocument();
    expect(screen.getByTestId("raffle-reel")).toHaveTextContent("Nova");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the frozen ranking, marked as final, whatever the live participants do", async () => {
    const frozen = { cadets: [{ position: 1, alias: "Congelada", squad: null, xp: 50 }], squads: [], at: new Date() };
    const { push } = renderScreen({ ...DEFAULT_STAGE, view: "cadets", frozen });

    await push((h) => h.participants([entry("Nueva", 900)]));

    expect(screen.getByText(t.frozen)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: t.cadetsTitle })).toHaveTextContent("Congelada");
    expect(screen.queryByText("Nueva")).not.toBeInTheDocument();
  });

  it("takes turns between cadets and squads when the view is both", async () => {
    renderScreen(DEFAULT_STAGE, 1000);
    expect(screen.getByRole("region", { name: t.cadetsTitle })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("region", { name: t.squadsTitle })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("region", { name: t.cadetsTitle })).toBeInTheDocument();
  });

  it("draws the admin's background behind everything, darkened, and none without one", () => {
    const background = { path: "public/e1/stage-background/abcdef123456.webp", url: "/media/public/e1/stage-background/abcdef123456.webp" };
    const { container, unmount } = renderScreen({ ...DEFAULT_STAGE, background });

    const image = container.querySelector(`img[src="${background.url}"]`);
    expect(image).toHaveAttribute("alt", "");
    expect(image?.closest('[aria-hidden="true"]')).not.toBeNull();
    unmount();

    expect(renderScreen().container.querySelector('img[src^="/media/"]')).toBeNull();
  });

  it("shows only the cadets when the edition has squads switched off, whatever the view says", async () => {
    const fake = fakeFeed();
    render(<StageScreen eventId="e1" feed={fake.feed} squads={SQUADS} sprites={SPRITES} initialStage={{ ...DEFAULT_STAGE, view: "squads" }} initialBoard={INITIAL_BOARD} alternateMs={1000} squadsOn={false} />);

    expect(screen.getByRole("region", { name: t.cadetsTitle })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByRole("region", { name: t.squadsTitle })).not.toBeInTheDocument();
  });

  it("says when it is reconnecting, and explains a missing or refused session instead of the ranking", async () => {
    const { push } = renderScreen();

    await push((h) => h.status("reconnecting"));
    expect(screen.getByRole("status")).toHaveTextContent(t.status.reconnecting);

    await push((h) => h.status("denied"));
    expect(screen.getByRole("alert")).toHaveTextContent(t.errors.denied.title);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says nobody has XP yet on an empty ranking", async () => {
    const { push } = renderScreen({ ...DEFAULT_STAGE, view: "cadets" });

    await push((h) => h.participants([entry("Cero", 0)]));

    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });

  it("asks for full screen, and stops listening when it goes away", () => {
    const request = vi.fn(async () => undefined);
    document.documentElement.requestFullscreen = request;
    const { stop, unmount } = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: t.fullscreen }));
    expect(request).toHaveBeenCalled();

    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = renderScreen();

    expect((await axe(container)).violations).toEqual([]);
  });

  it("hands a poll display to whoever draws polls, and follows the stage when it changes", () => {
    const renderPoll = vi.fn((pollId: string) => <p>Encuesta {pollId}</p>);
    const fake = fakeFeed();
    render(<StageScreen eventId="e1" feed={fake.feed} squads={SQUADS} sprites={SPRITES} initialStage={{ ...DEFAULT_STAGE, display: "poll", poll: { pollId: "poll-1" } }} initialBoard={INITIAL_BOARD} renderPoll={renderPoll} />);

    expect(screen.getByText("Encuesta poll-1")).toBeInTheDocument();
    fake.push((h) => h.stage({ ...DEFAULT_STAGE }));
    expect(screen.queryByText("Encuesta poll-1")).not.toBeInTheDocument();
  });
});
