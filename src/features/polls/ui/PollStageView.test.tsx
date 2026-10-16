// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { StagePollAction, StagePollView } from "./actions";
import { LivePollStage, PollStageView } from "./PollStageView";

const t = copy.stage.poll;
const POLL: StagePollView = {
  question: "¿Qué charla te gustó más?",
  status: "open",
  options: [
    { id: "o1", text: "Keynote", imageUrl: null },
    { id: "o2", text: "Firebase", imageUrl: "/media/public/e1/poll-option/abcdef123456.webp" },
  ],
};

describe("PollStageView", () => {
  it("shows the question, each option's share and how many voted", async () => {
    const { container } = render(<PollStageView poll={POLL} tally={{ counts: { o1: 3, o2: 1 }, total: 4 }} />);

    expect(screen.getByRole("heading", { name: POLL.question })).toBeInTheDocument();
    expect(screen.getByText(t.live)).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("4 votos")).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("says when the results are final", () => {
    render(<PollStageView poll={{ ...POLL, status: "closed" }} tally={{ counts: { o1: 1 }, total: 1 }} />);

    expect(screen.getByText(t.closed)).toBeInTheDocument();
    expect(screen.getByText(t.oneVote)).toBeInTheDocument();
  });
});

describe("LivePollStage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks for the results at once and again every few seconds, keeping the last ones when a refresh fails", async () => {
    const load = vi
      .fn<StagePollAction>()
      .mockResolvedValueOnce({ ok: true, poll: POLL, tally: { counts: { o1: 1 }, total: 1 } })
      .mockResolvedValueOnce({ ok: true, poll: POLL, tally: { counts: { o1: 1, o2: 1 }, total: 2 } })
      .mockRejectedValueOnce(new Error("offline"));
    render(<LivePollStage pollId="poll-1" load={load} every={1000} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledWith({ id: "poll-1" });
    expect(screen.getByText("1 voto")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("2 votos")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("2 votos")).toBeInTheDocument();
  });

  it("shows nothing until the first answer, and stops asking when it leaves the screen", async () => {
    const load = vi.fn<StagePollAction>(async () => ({ ok: false, code: "forbidden" }));
    const { container, unmount } = render(<LivePollStage pollId="poll-1" load={load} every={1000} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container).toBeEmptyDOMElement();
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
