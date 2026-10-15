// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { CadetStanding } from "../domain/ranking";
import { StandingCard } from "./StandingCard";

const t = copy.leaderboard.card;
const top = (me: number | null) =>
  Array.from({ length: 10 }, (_, index) => ({
    position: index + 1,
    alias: index + 1 === me ? "Nova_7" : `Cadete ${index + 1}`,
    squad: index % 2 === 0 ? "Escuadrón Firebase" : null,
    xp: 1000 - index * 50,
    isMe: index + 1 === me,
  }));
const standing = (overrides: Partial<CadetStanding> = {}): CadetStanding => ({ position: 3, xp: 900, total: 280, top: top(3), ...overrides });

describe("StandingCard", () => {
  it("says the cadet's place among all cadets and marks them in the top 10", () => {
    render(<StandingCard standing={standing()} alias="Nova_7" squad="Escuadrón Firebase" />);

    expect(screen.getByText("Vas en el puesto 3 de 280 cadetes")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: t.topLabel });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    const me = within(list).getAllByRole("listitem").find((item) => item.getAttribute("aria-current") === "true");
    expect(me).toHaveTextContent("Nova_7 · Tú");
    expect(me).toHaveTextContent("900 XP");
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent(t.noSquad);
    expect(screen.queryByRole("list", { name: t.gap })).not.toBeInTheDocument();
  });

  it("adds the cadet's own row after the top when they are further down", () => {
    render(<StandingCard standing={standing({ position: 23, xp: 120, top: top(null) })} alias="Nova_7" squad="Escuadrón Angular" />);

    const own = screen.getByRole("list", { name: t.gap });
    expect(own).toHaveTextContent("23");
    expect(own).toHaveTextContent("Nova_7 · Tú");
    expect(own).toHaveTextContent("Escuadrón Angular");
    expect(own).toHaveTextContent("120 XP");
  });

  it("invites a cadet without XP to earn their first, without a place", () => {
    render(<StandingCard standing={standing({ position: null, xp: 0, top: top(null) })} alias="Nova_7" squad={null} />);

    expect(screen.getByText(t.noPosition)).toBeInTheDocument();
    expect(screen.queryByText(/Vas en el puesto/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: t.gap })).not.toBeInTheDocument();
  });

  it("says nobody has XP yet when the ranking is empty", () => {
    render(<StandingCard standing={standing({ position: null, xp: 0, top: [] })} alias="Nova_7" squad={null} />);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<StandingCard standing={standing({ position: 23, top: top(null) })} alias="Nova_7" squad={null} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
