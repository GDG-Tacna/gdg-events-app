// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixelPlanet, type PlanetKind } from "./PixelPlanet";

const KINDS: readonly PlanetKind[] = ["gdg", "cloud", "firebase", "angular", "android", "ai"];

function paint(kind: PlanetKind) {
  const { container } = render(<PixelPlanet kind={kind} />);
  return [...container.querySelectorAll("rect")].map((rect) => ({
    x: Number(rect.getAttribute("x")),
    y: Number(rect.getAttribute("y")),
    width: Number(rect.getAttribute("width")),
    fill: rect.getAttribute("fill"),
  }));
}

describe("PixelPlanet kinds", () => {
  it.each(KINDS)("%s renders on a 16x16 grid with crisp edges", (kind) => {
    const { container } = render(<PixelPlanet kind={kind} scale={2} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
  });

  it.each(KINDS)("%s only paints inside the grid and gives every cell a color", (kind) => {
    const rects = paint(kind);

    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(16);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeLessThan(16);
      expect(rect.fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("gives each technology planet its own colors so squads and quadrants are told apart at a glance", () => {
    // The GDG planet is excluded on purpose: it carries all four Google colors, so it overlaps with Cloud.
    const squadKinds: readonly PlanetKind[] = ["cloud", "firebase", "angular", "android", "ai"];
    const palettes = squadKinds.map((kind) => new Set(paint(kind).map((rect) => rect.fill)));

    for (let a = 0; a < palettes.length; a += 1) {
      for (let b = a + 1; b < palettes.length; b += 1) {
        const shared = [...palettes[a]].filter((color) => palettes[b].has(color));
        expect(shared, `${squadKinds[a]} and ${squadKinds[b]} share ${shared.join(", ")}`).toEqual([]);
      }
    }
  });

  it("keeps the GDG planet exactly as before (four bands of brand colors)", () => {
    const fills = new Set(paint("gdg").map((rect) => rect.fill));

    expect(fills).toContain("#4285f4");
    expect(fills).toContain("#ea4335");
    expect(fills).toContain("#fbbc05");
    expect(fills).toContain("#34a853");
  });

  it("is symmetric top to bottom in silhouette: every row has paint from the same span", () => {
    // A round planet: the first and last rows are narrower than the middle ones.
    const rects = paint("cloud");
    const width = (y: number) => rects.filter((r) => r.y === y).reduce((sum, r) => sum + r.width, 0);

    expect(width(0)).toBeLessThan(width(7));
    expect(width(15)).toBeLessThan(width(8));
    expect(width(0)).toBe(width(15));
  });
});
