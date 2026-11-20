// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { TeamPlayCallout } from "./TeamPlayCallout";

describe("TeamPlayCallout", () => {
  it("tells a cadet that plays as team where their team screen is, with their role", () => {
    render(<TeamPlayCallout kind="toTeam" href="/staff" role="Staff" />);

    expect(screen.getByRole("region", { name: copy.teamPlay.toTeam.label })).toBeInTheDocument();
    expect(screen.getByText("Eres Staff del equipo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.teamPlay.toTeam.open })).toHaveAttribute("href", "/staff");
  });

  it("offers a team screen the way to the cadet panel", () => {
    render(<TeamPlayCallout kind="toCadet" href="/dashboard" />);

    expect(screen.getByText(copy.teamPlay.toCadet.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.teamPlay.toCadet.open })).toHaveAttribute("href", "/dashboard");
  });

  it("offers a team screen the way to sign up as a cadet", () => {
    render(<TeamPlayCallout kind="join" href="/onboarding" />);

    expect(screen.getByText(copy.teamPlay.join.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.teamPlay.join.open })).toHaveAttribute("href", "/onboarding");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<TeamPlayCallout kind="toTeam" href="/admin" role="Admin" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
