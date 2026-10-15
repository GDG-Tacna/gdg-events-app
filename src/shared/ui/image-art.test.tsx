// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MedalArt } from "./MedalArt";
import { SquadArt } from "./SquadArt";
import { Thumbnail } from "./Thumbnail";

const SPRITE = { rows: Array.from({ length: 16 }, (_, y) => (y === 0 ? "a..............." : "................")), palette: { a: "#22d3ee" } };

describe("uploaded art with a pixel fallback", () => {
  it("shows a squad's uploaded logo at the pixel logo's size, or its drawing when there is none", () => {
    const { container, rerender } = render(<SquadArt sprite={SPRITE} logoUrl="https://cdn/logo.svg" scale={3} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn/logo.svg");
    expect(img).toHaveStyle({ width: "48px", height: "48px" });

    rerender(<SquadArt sprite={SPRITE} logoUrl={null} scale={3} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows a badge's image, grey while locked, or the pixel medal in its colour", () => {
    const { container, rerender } = render(<MedalArt tone="gold" imageUrl="https://cdn/b.webp" locked scale={2} />);
    expect(container.querySelector("img")).toHaveClass("grayscale");
    expect(container.querySelector("img")).toHaveStyle({ width: "32px" });

    rerender(<MedalArt tone="unknown-tone" scale={2} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("keeps thumbnails decorative, next to the name that says what they are", () => {
    const { container } = render(<Thumbnail url="https://cdn/p.webp" size={48} />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
