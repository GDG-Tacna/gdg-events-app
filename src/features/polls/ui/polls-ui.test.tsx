// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Poll } from "../domain/poll";
import type { CadetPoll } from "../domain/vote";
import type { PollResultsAction, PollStateAction, SavePollAction, VoteAction } from "./actions";
import { PollForm } from "./PollForm";
import { PollResultsView } from "./PollResultsView";
import { PollsAdminView } from "./PollsAdminView";
import { LivePollCard, PollVoteView } from "./PollVoteView";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.polls;
const f = t.form;
const c = copy.poll;

const poll = (id: string, extra: Partial<Poll> = {}): Poll => ({
  id,
  question: `Pregunta ${id}`,
  options: [
    { id: "o1", text: "Keynote", image: null },
    { id: "o2", text: "Firebase", image: { path: "public/e1/poll-option/abcdef123456.webp", url: "/media/x.webp" } },
  ],
  changeable: false,
  reward: { kind: "none" },
  status: "draft",
  createdAt: new Date(0),
  openedAt: null,
  closedAt: null,
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("PollsAdminView", () => {
  function renderList(polls: Poll[]) {
    const change = vi.fn<PollStateAction>(async () => ({ ok: true }));
    const view = render(<PollsAdminView polls={polls} change={change} hrefs={{ create: "/admin/encuestas/nueva", base: "/admin/encuestas" }} />);
    return { change, view, user: userEvent.setup() };
  }

  it("lists each poll with its state, options, vote rule and prize, and what can be done with it", () => {
    renderList([poll("poll-open", { status: "open", changeable: true, reward: { kind: "xp", amount: 20 } }), poll("poll-draft"), poll("poll-closed", { status: "closed" })]);

    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(`${t.status.open}2 opciones · ${t.changeable} · +20 XP`);
    expect(within(items[0]).getByRole("button", { name: `${t.close}: Pregunta poll-open` })).toBeInTheDocument();
    // Another poll is open: a draft cannot be opened until it closes.
    expect(within(items[1]).getByRole("button", { name: `${t.open}: Pregunta poll-draft` })).toBeDisabled();
    expect(within(items[1]).getByRole("link", { name: `${t.edit}: Pregunta poll-draft` })).toHaveAttribute("href", "/admin/encuestas/poll-draft");
    expect(within(items[2]).getByRole("link", { name: `${t.results}: Pregunta poll-closed` })).toHaveAttribute("href", "/admin/encuestas/poll-closed");
    expect(screen.getByRole("link", { name: t.create })).toHaveAttribute("href", "/admin/encuestas/nueva");
  });

  it("opens a draft and says so, or shows the server's refusal", async () => {
    const { change, user } = renderList([poll("poll-draft")]);

    await user.click(screen.getByRole("button", { name: `${t.open}: Pregunta poll-draft` }));
    expect(change).toHaveBeenCalledWith({ id: "poll-draft", action: "open" });
    expect(await screen.findByText("«Pregunta poll-draft» está abierta: los cadetes ya pueden votar.")).toHaveAttribute("role", "status");

    change.mockResolvedValueOnce({ ok: false, code: "another-open" });
    await user.click(screen.getByRole("button", { name: `${t.open}: Pregunta poll-draft` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["another-open"]);
  });

  it("deletes a draft only after confirming", async () => {
    const { change, user } = renderList([poll("poll-draft")]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    await user.click(screen.getByRole("button", { name: `${t.remove}: Pregunta poll-draft` }));
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: `${t.remove}: Pregunta poll-draft` }));
    expect(change).toHaveBeenCalledWith({ id: "poll-draft", action: "delete" });
    confirm.mockRestore();
  });

  it("says when there are none, and has no detectable accessibility violations", async () => {
    const { view } = renderList([]);
    expect(screen.getByText(t.empty)).toBeInTheDocument();
    view.unmount();

    const { view: full } = renderList([poll("poll-open", { status: "open" }), poll("poll-draft")]);
    expect((await axe(full.container)).violations).toEqual([]);
  });
});

describe("PollForm", () => {
  function renderForm(existing?: Poll) {
    const save = vi.fn<SavePollAction>(async () => ({ ok: true }));
    const view = render(<PollForm poll={existing} save={save} upload={vi.fn()} listHref="/admin/encuestas" />);
    return { save, view, user: userEvent.setup() };
  }

  it("creates a poll with its options, vote rule and prize, then goes back to the list", async () => {
    const { save, user } = renderForm();

    await user.type(screen.getByLabelText(f.question), "¿Qué charla te gustó más?");
    await user.type(screen.getByLabelText("Opción 1"), "Keynote");
    await user.type(screen.getByLabelText("Opción 2"), "Firebase");
    await user.click(screen.getByRole("button", { name: f.addOption }));
    await user.type(screen.getByLabelText("Opción 3"), "Android");
    await user.click(screen.getByRole("checkbox", { name: f.changeable }));
    await user.click(screen.getByRole("radio", { name: f.rewardKinds.credits }));
    await user.type(screen.getByLabelText(f.creditsAmount), "15");
    await user.click(screen.getByRole("button", { name: f.save }));

    expect(save).toHaveBeenCalledWith({
      draft: {
        question: "¿Qué charla te gustó más?",
        options: [
          { text: "Keynote", imagePath: null },
          { text: "Firebase", imagePath: null },
          { text: "Android", imagePath: null },
        ],
        changeable: true,
        reward: { kind: "credits", amount: 15 },
      },
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/encuestas"));
  });

  it("edits a draft keeping its pictures, removes an option, and says what to fix before sending", async () => {
    const existing = poll("poll-1", { options: [...poll("x").options, { id: "o3", text: "Android", image: null }] });
    const { save, user } = renderForm(existing);

    expect(screen.getByRole("heading", { name: f.editTitle })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar la opción 3" }));
    await user.click(screen.getByRole("button", { name: f.save }));
    expect(save).toHaveBeenCalledWith({
      id: "poll-1",
      draft: expect.objectContaining({ options: [{ text: "Keynote", imagePath: null }, { text: "Firebase", imagePath: "public/e1/poll-option/abcdef123456.webp" }] }),
    });

    save.mockClear();
    await user.clear(screen.getByLabelText(f.question));
    await user.click(screen.getByRole("button", { name: f.save }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText(f.question)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-question"]));
  });

  it("never drops below two options, and has no detectable accessibility violations", async () => {
    const { view } = renderForm();

    expect(screen.queryByRole("button", { name: "Quitar la opción 1" })).not.toBeInTheDocument();
    expect((await axe(view.container)).violations).toEqual([]);
  });
});

describe("PollResultsView", () => {
  afterEach(() => vi.useRealTimers());

  it("shows each option's votes and share, refreshing on its own while the poll is open", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn<PollResultsAction>(async () => ({ ok: true, tally: { counts: { o1: 3, o2: 1 }, total: 4 } }));
    render(<PollResultsView poll={poll("poll-1", { status: "open" })} tally={{ counts: { o1: 1, o2: 1 }, total: 2 }} refresh={refresh} listHref="/admin/encuestas" every={1000} />);

    expect(screen.getByText(/2 votos/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Keynote" })).toHaveAttribute("aria-valuetext", "1 · 50%");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(refresh).toHaveBeenCalledWith({ id: "poll-1" });
    expect(screen.getByRole("progressbar", { name: "Keynote" })).toHaveAttribute("aria-valuetext", "3 · 75%");
  });

  it("stays still for a closed poll", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn<PollResultsAction>();
    render(<PollResultsView poll={poll("poll-1", { status: "closed" })} tally={{ counts: { o1: 1 }, total: 1 }} refresh={refresh} listHref="/admin/encuestas" every={1000} />);

    expect(screen.getByText("1 voto")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("cadet poll", () => {
  const current = (extra: Partial<CadetPoll> = {}, pollExtra: Partial<Poll> = {}): CadetPoll => ({ poll: poll("poll-1", { status: "open", ...pollExtra }), myVote: null, reward: { xp: 20, credits: 0 }, ...extra });

  function renderVote(state: CadetPoll | null) {
    const vote = vi.fn<VoteAction>(async () => ({ ok: true, xp: 20, credits: 0 }));
    const view = render(<PollVoteView current={state} vote={vote} homeHref="/dashboard" />);
    return { vote, view, user: userEvent.setup() };
  }

  it("shows the card on the dashboard with the prize, or a way back to it once voted", () => {
    const { rerender } = render(<LivePollCard poll={current()} href="/encuesta" />);
    expect(screen.getByText("Votar te da +20 XP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: c.cardAction })).toHaveAttribute("href", "/encuesta");

    rerender(<LivePollCard poll={current({ myVote: "o1" })} href="/encuesta" />);
    expect(screen.getByRole("link", { name: c.cardSee })).toBeInTheDocument();
  });

  it("votes, says what it earned, and keeps a final vote locked", async () => {
    const { vote, user } = renderVote(current());

    expect(screen.getByRole("button", { name: c.vote })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Firebase" }));
    await user.click(screen.getByRole("button", { name: c.vote }));

    expect(vote).toHaveBeenCalledWith({ pollId: "poll-1", optionId: "o2" });
    expect(await screen.findByText("¡Voto registrado! Ganaste 20 XP.")).toHaveFocus();
    expect(screen.getByText("Votaste: Firebase")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: c.change })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Keynote" })).toBeDisabled();
  });

  it("lets a vote change while the poll allows it", async () => {
    const { vote, user } = renderVote(current({ myVote: "o1" }, { changeable: true }));

    expect(screen.getByRole("radio", { name: "Keynote" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Firebase" }));
    await user.click(screen.getByRole("button", { name: c.change }));
    expect(vote).toHaveBeenCalledWith({ pollId: "poll-1", optionId: "o2" });
  });

  it("explains a closed poll, and when none is open", async () => {
    const { vote, user, view } = renderVote(current());
    vote.mockResolvedValueOnce({ ok: false, code: "closed" });

    await user.click(screen.getByRole("radio", { name: "Keynote" }));
    await user.click(screen.getByRole("button", { name: c.vote }));
    expect(await screen.findByRole("alert")).toHaveTextContent(c.errors.closed);
    expect(screen.queryByRole("button", { name: c.vote })).not.toBeInTheDocument();
    view.unmount();

    renderVote(null);
    expect(screen.getByText(c.none)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: c.back })).toHaveAttribute("href", "/dashboard");
  });

  it("has no detectable accessibility violations", async () => {
    const { view } = renderVote(current());
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
