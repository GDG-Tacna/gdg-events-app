// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { IssuePassAction, IssuePassActionResult } from "./action";
import { PassCard } from "./PassCard";
import { PassDisplay } from "./PassDisplay";

const CELLS = ["1110", "1010", "1110", "0001"];

const issued = (lifeSeconds = 60): IssuePassActionResult => {
  const issuedAt = Date.now();
  return { ok: true, pass: { cells: CELLS, issuedAt, expiresAt: issuedAt + lifeSeconds * 1000 } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function renderDisplay(issue: IssuePassAction) {
  const view = render(<PassDisplay issue={issue} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

describe("PassDisplay", () => {
  it("shows a loading state while the first pass is made", () => {
    render(<PassDisplay issue={() => new Promise(() => undefined)} />);

    expect(screen.getByRole("heading", { level: 1, name: copy.pass.title })).toBeInTheDocument();
    expect(screen.getByText(copy.pass.loading)).toBeInTheDocument();
  });

  it("shows the pass for the staff to scan, and tells the attendee how to help it read", async () => {
    await renderDisplay(vi.fn(async () => issued()));

    expect(screen.getByRole("img", { name: copy.pass.codeLabel })).toBeInTheDocument();
    expect(screen.getByText(copy.pass.renews)).toBeInTheDocument();
    expect(screen.getByText(copy.pass.brightness)).toBeInTheDocument();
  });

  it("renews the pass before it ends, so the staff never scan a dead one", async () => {
    const issue = vi.fn<IssuePassAction>(async () => issued(60));
    await renderDisplay(issue);
    expect(issue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(issue).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: copy.pass.codeLabel })).toBeInTheDocument();
  });

  it("keeps the current pass up and says it is reconnecting when a renewal fails", async () => {
    const issue = vi.fn<IssuePassAction>(async () => issued(60));
    await renderDisplay(issue);
    issue.mockResolvedValue({ ok: false, code: "unknown" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(screen.getByRole("img", { name: copy.pass.codeLabel })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.pass.reconnecting);
  });

  it("never shows a dead pass: when it ends without a new one it says so", async () => {
    const issue = vi.fn<IssuePassAction>(async () => issued(5));
    await renderDisplay(issue);
    issue.mockResolvedValue({ ok: false, code: "unknown" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });

    expect(screen.getByText(copy.pass.expired)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: copy.pass.codeLabel })).not.toBeInTheDocument();
  });

  it.each(["forbidden", "unauthenticated", "disabled"] as const)("explains a %s refusal and offers to retry", async (code) => {
    await renderDisplay(vi.fn(async () => ({ ok: false, code }) as const));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.pass.errors[code]);
    expect(screen.getByRole("button", { name: copy.pass.retry })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(<PassDisplay issue={async () => issued()} />);
    await screen.findByRole("img", { name: copy.pass.codeLabel });

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("PassCard", () => {
  it("leads to the pass with a real link", () => {
    render(<PassCard href="/pass" />);

    // The whole card is the link: its name says what it is and what it is for.
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/pass");
    expect(link).toHaveAccessibleName(expect.stringContaining(copy.pass.card.title));
    expect(link).toHaveTextContent(copy.pass.card.body);
    expect(link).toHaveTextContent(copy.pass.card.badge);
  });
});
