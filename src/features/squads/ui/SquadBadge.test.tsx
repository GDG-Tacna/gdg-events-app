// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { STATIC_SQUADS } from "../data/static-squad-catalog";
import { SquadBadge } from "./SquadBadge";

describe("SquadBadge", () => {
  it.each(STATIC_SQUADS)("shows the name of the $id squad", (squad) => {
    render(<SquadBadge squad={squad} />);

    expect(screen.getByText(squad.name)).toBeInTheDocument();
  });

  it("draws the squad logo at 16 pixels", () => {
    const { container } = render(<SquadBadge squad={STATIC_SQUADS[0]} />);
    const logo = container.querySelector("svg");

    expect(logo).toHaveAttribute("viewBox", "0 0 16 16");
    expect(logo).toHaveAttribute("width", "16");
    expect(logo).toHaveAttribute("shape-rendering", "crispEdges");
  });

  it("keeps the logo decorative so the squad is not announced twice", () => {
    const { container } = render(<SquadBadge squad={STATIC_SQUADS[1]} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("works with a squad an admin defined later: only a name and a sprite are needed", () => {
    render(<SquadBadge squad={{ name: "Escuadrón Nuevo", sprite: { rows: ["xx", "xx"], palette: { x: "#ffffff" } } }} />);

    expect(screen.getByText("Escuadrón Nuevo")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<SquadBadge squad={STATIC_SQUADS[2]} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
