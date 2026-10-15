// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { STATIC_SQUADS } from "../data/static-squad-catalog";
import type { Squad } from "../domain/squad";
import type { AssignSquadAction, AssignSquadActionResult } from "./assignment";
import { SquadReveal } from "./SquadReveal";

const discoverButton = () => screen.getByRole("button", { name: copy.reveal.discover });
const renderReveal = (
  assign: AssignSquadAction,
  initialSquad: string | null = null,
  squads: readonly Squad[] = STATIC_SQUADS,
) => render(<SquadReveal squads={squads} assign={assign} initialSquad={initialSquad} continueHref="/dashboard" />);

describe("SquadReveal", () => {
  it("starts with the logo of every squad and the button, and no alert", () => {
    const { container } = renderReveal(vi.fn());

    expect(screen.getByRole("heading", { level: 1, name: copy.reveal.title })).toBeInTheDocument();
    expect(discoverButton()).toBeEnabled();
    // One logo per squad (the brand mark's GDG logo is 28x16, not a squad logo).
    expect(container.querySelectorAll("svg[viewBox='0 0 16 16']")).toHaveLength(STATIC_SQUADS.length);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows as many logos as squads the catalog offers, so an admin can add or retire them", () => {
    const { container } = renderReveal(vi.fn(), null, STATIC_SQUADS.slice(0, 2));

    expect(container.querySelectorAll("svg[viewBox='0 0 16 16']")).toHaveLength(2);
  });

  it("previews only the active squads, but still reveals a retired one with its logo and name", () => {
    const squads = STATIC_SQUADS.map((squad, index) => (index === 0 ? { ...squad, active: false } : squad));
    const idle = renderReveal(vi.fn(), null, squads);

    expect(idle.container.querySelectorAll("svg[viewBox='0 0 16 16']")).toHaveLength(squads.length - 1);
    idle.unmount();

    const { container } = renderReveal(vi.fn(), squads[0].id, squads);
    expect(screen.getByRole("heading", { level: 1, name: squads[0].name })).toBeInTheDocument();
    expect(screen.getByText(squads[0].tagline)).toBeInTheDocument();
    expect(container.querySelector("svg[width='160']")).toBeInTheDocument();
  });

  it("shows a busy button while it looks for the squad", async () => {
    let finish!: (result: AssignSquadActionResult) => void;
    const assign = vi.fn<AssignSquadAction>(() => new Promise((resolve) => (finish = resolve)));
    renderReveal(assign);

    await userEvent.click(discoverButton());

    const busy = screen.getByRole("button", { name: copy.reveal.discovering });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    finish({ ok: true, squad: "gemini", assigned: true });
    await screen.findByRole("heading", { level: 1, name: STATIC_SQUADS[2].name });
  });

  it.each(STATIC_SQUADS)("reveals the $id squad with its name, tagline, logo and a way forward", async (squad) => {
    const { container } = renderReveal(vi.fn<AssignSquadAction>(async () => ({ ok: true, squad: squad.id, assigned: true })));

    await userEvent.click(discoverButton());

    expect(await screen.findByRole("heading", { level: 1, name: squad.name })).toBeInTheDocument();
    expect(screen.getByText(squad.tagline)).toBeInTheDocument();
    expect(screen.getByText(copy.reveal.yourSquad)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.reveal.continue })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: copy.reveal.discover })).not.toBeInTheDocument();
    // The big logo is the squad sprite scaled by 10 (160px).
    expect(container.querySelector("svg[width='160']")).toBeInTheDocument();
  });

  it("announces the reveal to screen readers and moves the focus to the squad name", async () => {
    renderReveal(vi.fn<AssignSquadAction>(async () => ({ ok: true, squad: "firebase", assigned: true })));

    await userEvent.click(discoverButton());

    const heading = await screen.findByRole("heading", { level: 1, name: STATIC_SQUADS[1].name });
    expect(screen.getByRole("status")).toContainElement(heading);
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("opens already revealed when the attendee has a squad, without asking the server or stealing focus", () => {
    const assign = vi.fn<AssignSquadAction>();
    renderReveal(assign, "angular");

    const heading = screen.getByRole("heading", { level: 1, name: STATIC_SQUADS[0].name });
    expect(heading).toBeInTheDocument();
    expect(heading).not.toHaveFocus();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: copy.reveal.continue })).toBeInTheDocument();
  });

  it("still shows a sensible screen for a squad that was retired from the catalog", () => {
    const { container } = renderReveal(vi.fn(), "cloud");

    expect(screen.getByRole("heading", { level: 1, name: "cloud" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.reveal.continue })).toBeInTheDocument();
    // No tagline to show, and the generic GDG planet stands in for the missing logo.
    expect(container.querySelector("svg[width='160']")).toBeInTheDocument();
  });

  it.each(["not-registered", "unauthenticated", "forbidden", "disabled", "unknown"] as const)(
    "shows the message for a %s failure and lets the user try again",
    async (code) => {
      renderReveal(vi.fn<AssignSquadAction>(async () => ({ ok: false, code })));

      await userEvent.click(discoverButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(copy.reveal.errors[code]);
      expect(discoverButton()).toBeEnabled();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    },
  );

  it("recovers on retry and clears the error", async () => {
    const assign = vi
      .fn<AssignSquadAction>()
      .mockResolvedValueOnce({ ok: false, code: "unknown" })
      .mockResolvedValueOnce({ ok: true, squad: "gemini", assigned: true });
    renderReveal(assign);

    await userEvent.click(discoverButton());
    await screen.findByRole("alert");
    await userEvent.click(discoverButton());

    expect(await screen.findByRole("heading", { level: 1, name: STATIC_SQUADS[2].name })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations (idle, error and revealed)", async () => {
    const assign = vi
      .fn<AssignSquadAction>()
      .mockResolvedValueOnce({ ok: false, code: "unknown" })
      .mockResolvedValueOnce({ ok: true, squad: "gemini", assigned: true });
    const { container } = renderReveal(assign);
    expect((await axe(container)).violations).toEqual([]);

    await userEvent.click(discoverButton());
    await screen.findByRole("alert");
    expect((await axe(container)).violations).toEqual([]);

    await userEvent.click(discoverButton());
    await screen.findByRole("heading", { level: 1, name: STATIC_SQUADS[2].name });
    expect((await axe(container)).violations).toEqual([]);
  });
});
