// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { medalSprite } from "./pixel/PixelMedal";
import { UnlockedBadges } from "./UnlockedBadges";

const t = copy.achievements.unlocked;

describe("UnlockedBadges", () => {
  it("celebrates each new badge by name, with a link to the Logros tab", async () => {
    const { container } = render(<UnlockedBadges badges={[{ id: "a", name: "Primer salto", tone: "lime" }, { id: "b", name: "Oyente", tone: "unknown" }]} href="/achievements" />);

    expect(screen.getByText(t.title)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: t.label })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Primer salto", "Oyente"]);
    expect(screen.getByRole("link", { name: t.see })).toHaveAttribute("href", "/achievements");
    expect((await axe(container)).violations).toEqual([]);
  });

  it("draws nothing without badges, and no link without a destination", () => {
    const { container } = render(<UnlockedBadges badges={[]} href="/achievements" />);
    expect(container).toBeEmptyDOMElement();

    render(<UnlockedBadges badges={[{ id: "a", name: "Primer salto", tone: "gold" }]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("medalSprite", () => {
  it("is 16 by 16 in every colour, with every pixel in its palette, and grey when locked", () => {
    for (const tone of ["cyan", "lime", "gold", "magenta", "violet", "locked"] as const) {
      const sprite = medalSprite(tone);
      expect(sprite.rows).toHaveLength(16);
      for (const row of sprite.rows) {
        expect(row).toHaveLength(16);
        for (const pixel of row) if (pixel !== ".") expect(sprite.palette).toHaveProperty(pixel);
      }
    }
    expect(medalSprite("locked").palette.F).not.toBe(medalSprite("gold").palette.F);
    expect(medalSprite("gold").rows).toEqual(medalSprite("cyan").rows);
  });
});
