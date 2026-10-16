// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { DEFAULT_STAGE, type StageState } from "../domain/stage";
import type { UpdateStageAction } from "./stage-actions";
import { StageControlView } from "./StageControlView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const t = copy.admin.stage;
const LIVE = {
  cadets: Array.from({ length: 7 }, (_, i) => ({ position: i + 1, alias: `Cadete ${i + 1}`, squad: null, xp: 700 - i * 50 })),
  squads: [{ position: 1, id: "firebase", name: "Escuadrón Firebase", xp: 1200, members: 4 }],
};
const FROZEN_AT = new Date("2026-10-24T23:42:00Z"); // 18:42 in Lima

function renderView(stage: StageState = DEFAULT_STAGE, run = vi.fn<UpdateStageAction>(async () => ({ ok: true }))) {
  return { ...render(<StageControlView stage={stage} live={LIVE} run={run} />), run };
}

describe("StageControlView", () => {
  beforeEach(() => refresh.mockReset());

  it("says what the big screen shows now and previews the live ranking (top 5 and squads)", () => {
    renderView();

    expect(screen.getByText(t.now.live)).toBeInTheDocument();
    expect(screen.getByText(t.previewLive)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: t.previewCadets })).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("list", { name: t.previewSquads })).toHaveTextContent("Escuadrón Firebase");
    expect(screen.getByRole("button", { name: t.showRanking })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: t.views.both })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the projector's background only with an upload, and saves a removal at once", async () => {
    const run = vi.fn<UpdateStageAction>(async () => ({ ok: true }));
    const background = { path: "public/e1/stage-background/abcdef123456.webp", url: "/media/public/e1/stage-background/abcdef123456.webp" };
    const { unmount } = render(<StageControlView stage={{ ...DEFAULT_STAGE, background }} live={LIVE} run={run} upload={vi.fn()} />);

    expect(screen.getByRole("heading", { name: t.backgroundTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.common.image.remove }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ type: "background", path: null }));
    unmount();

    render(<StageControlView stage={DEFAULT_STAGE} live={LIVE} run={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: t.backgroundTitle })).not.toBeInTheDocument();
  });

  it("offers no view to pick when the edition has squads switched off", () => {
    render(<StageControlView stage={DEFAULT_STAGE} live={LIVE} run={vi.fn()} squadsOn={false} />);

    expect(screen.queryByRole("group", { name: t.viewTitle })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.views.squads })).not.toBeInTheDocument();
  });

  it("says since when the ranking is frozen, in the event's time, and previews the frozen one", () => {
    renderView({ ...DEFAULT_STAGE, frozen: { cadets: [{ position: 1, alias: "Congelada", squad: null, xp: 10 }], squads: [], at: FROZEN_AT } });

    expect(screen.getByText("Ranking congelado desde las 18:42")).toBeInTheDocument();
    expect(screen.getByText(t.previewFrozen)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: t.previewCadets })).toHaveTextContent("Congelada");
    expect(screen.getByRole("button", { name: t.unfreeze })).toBeInTheDocument();
  });

  it.each([
    [t.showWaiting, { type: "show", display: "waiting" }],
    [t.views.squads, { type: "view", view: "squads" }],
    [t.freeze, { type: "freeze" }],
  ])("sends %s and refreshes", async (name, command) => {
    const { run } = renderView();

    fireEvent.click(screen.getByRole("button", { name }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(t.done));
    expect(run).toHaveBeenCalledWith(command);
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before revealing the champions, and can be cancelled", async () => {
    const { run } = renderView();

    fireEvent.click(screen.getByRole("button", { name: t.reveal }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.revealConfirm);
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: t.reveal }));
    fireEvent.click(screen.getByRole("button", { name: t.revealYes }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ type: "reveal" }));
  });

  it("shows the champions while revealed, and goes back to the ranking", async () => {
    const { run } = renderView({ ...DEFAULT_STAGE, display: "reveal", champions: { cadet: LIVE.cadets[0], squad: null } });

    expect(screen.getByText(t.now.reveal)).toBeInTheDocument();
    const champions = screen.getByLabelText(t.championsLabel);
    expect(champions).toHaveTextContent("Cadete 1 · 700 XP");
    expect(champions).toHaveTextContent(t.noChampion);

    fireEvent.click(screen.getByRole("button", { name: t.backToRanking }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ type: "show", display: "ranking" }));
  });

  it("explains a refusal or a failure, without refreshing", async () => {
    const run = vi.fn<UpdateStageAction>().mockResolvedValueOnce({ ok: false, code: "not-frozen" }).mockRejectedValueOnce(new Error("offline"));
    renderView({ ...DEFAULT_STAGE, frozen: { cadets: [], squads: [], at: FROZEN_AT } }, run);

    fireEvent.click(screen.getByRole("button", { name: t.unfreeze }));
    expect(await screen.findByText(t.errors["not-frozen"])).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.unfreeze }));
    expect(await screen.findByText(t.errors.unknown)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens the stage screen in a new tab, when given", () => {
    render(<StageControlView stage={DEFAULT_STAGE} live={LIVE} run={vi.fn()} screenHref="/escenario" />);

    const link = screen.getByRole("link", { name: copy.stage.openFromAdmin });
    expect(link).toHaveAttribute("href", "/escenario");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("says which prize is being drawn on the big screen", () => {
    renderView({ ...DEFAULT_STAGE, display: "raffle", raffle: { drawId: "p-1", prizeName: "Polera", prizeImageUrl: null, winner: { alias: "Nova", squad: null }, tickets: 1, totalTickets: 2, reel: [], at: new Date() } });

    expect(screen.getByText("Sorteo: Polera")).toBeInTheDocument();
  });

  it("works without a preview when the live ranking could not be read", () => {
    render(<StageControlView stage={DEFAULT_STAGE} live={null} run={vi.fn()} />);

    expect(screen.queryByText(t.previewTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.freeze })).toBeEnabled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderView({ ...DEFAULT_STAGE, display: "reveal", champions: { cadet: LIVE.cadets[0], squad: LIVE.squads[0] } });

    expect((await axe(container)).violations).toEqual([]);
  });

  it("puts an opened poll's results on screen, marks the one shown, and says when there is none to show", async () => {
    const run = vi.fn<UpdateStageAction>(async () => ({ ok: true }));
    const polls = [
      { id: "poll-open", question: "¿Qué charla te gustó más?", status: "open" as const },
      { id: "poll-old", question: "¿Primera vez en un DevFest?", status: "closed" as const },
    ];
    const { unmount } = render(<StageControlView stage={{ ...DEFAULT_STAGE, display: "poll", poll: { pollId: "poll-old" } }} live={LIVE} run={run} polls={polls} />);

    expect(screen.getByText(t.now.poll)).toBeInTheDocument();
    const list = within(screen.getByRole("list", { name: t.pollListLabel }));
    expect(list.getByRole("button", { name: t.pollShown })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(list.getByRole("button", { name: t.pollShow }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ type: "poll", pollId: "poll-open" }));
    unmount();

    render(<StageControlView stage={DEFAULT_STAGE} live={LIVE} run={run} polls={[]} />);
    expect(screen.getByText(t.pollNone)).toBeInTheDocument();
  });

  it("has no poll card with polls off", () => {
    renderView();

    expect(screen.queryByRole("heading", { name: t.pollTitle })).not.toBeInTheDocument();
  });
});
