// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { MissionsCard } from "./MissionsCard";

describe("MissionsCard", () => {
  it("is the gold entry: the XP on offer as a game tag and the quadrants where the missions are", () => {
    render(<MissionsCard href="/missions" xp={1500} quadrants={["Google Cloud", "Firebase", "AI"]} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/missions");
    expect(link.className).toContain("border-gold");
    expect(link).toHaveTextContent(copy.dashboard.missionsCard.title);
    expect(link).toHaveTextContent("+1,500 XP");
    expect(link).toHaveTextContent("Misiones en Google Cloud, Firebase y AI.");
  });

  it("joins one or two quadrants naturally, and says when there are none yet, without a tag", () => {
    const { rerender } = render(<MissionsCard href="/missions" xp={50} quadrants={["Firebase"]} />);
    expect(screen.getByRole("link")).toHaveTextContent("Misiones en Firebase.");

    rerender(<MissionsCard href="/missions" xp={50} quadrants={["Firebase", "AI"]} />);
    expect(screen.getByRole("link")).toHaveTextContent("Misiones en Firebase y AI.");

    rerender(<MissionsCard href="/missions" xp={0} quadrants={[]} />);
    expect(screen.getByRole("link")).toHaveTextContent(copy.dashboard.missionsCard.empty);
    expect(screen.getByRole("link")).not.toHaveTextContent("XP");
  });
});

