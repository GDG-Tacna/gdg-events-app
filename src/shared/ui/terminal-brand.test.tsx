// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { BrandMark } from "./BrandMark";
import { gdgLogoSprite, PixelGdgLogo } from "./pixel/PixelGdgLogo";
import { TerminalCard } from "./TerminalCard";

describe("TerminalCard", () => {
  it("with a button: a named section with the title, the text and a real link as the call to action", () => {
    render(<TerminalCard icon="users" title="Red de cadetes" body="Conecta con otros cadetes." action={{ href: "/red", label: "Abrir la Red", kind: "button" }} />);

    const section = screen.getByRole("region", { name: "Red de cadetes" });
    expect(section).toHaveTextContent("Conecta con otros cadetes.");
    expect(within(section).getByRole("link", { name: "Abrir la Red" })).toHaveAttribute("href", "/red");
  });

  it("with a chevron: the whole card is one link named by its content, with its chip or tag", () => {
    render(<TerminalCard icon="qr" title="Tu QR" badge="Listo" tag="+500 XP" body="El staff lo escanea." action={{ href: "/pass", label: "Mostrar mi QR", kind: "chevron" }} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/pass");
    expect(link).toHaveAccessibleName(expect.stringContaining("Tu QR"));
    expect(link).toHaveTextContent("Listo");
    expect(link).toHaveTextContent("El staff lo escanea.");
    // The game tag is the only text in the pixel font.
    expect(screen.getByText("+500 XP").className).toContain("type-pixel-tag");
  });

  it("is gold for the main call to action, cyan otherwise", () => {
    const { rerender } = render(<TerminalCard icon="target" tone="gold" title="Misiones" body="x" action={{ href: "/m", label: "Ver", kind: "chevron" }} />);
    expect(screen.getByRole("link").className).toContain("border-gold");

    rerender(<TerminalCard icon="target" title="Misiones" body="x" action={{ href: "/m", label: "Ver", kind: "chevron" }} />);
    expect(screen.getByRole("link").className).toContain("border-cyan");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <div>
        <TerminalCard icon="users" title="Red de cadetes" body="Texto" action={{ href: "/red", label: "Abrir la Red", kind: "button" }} />
        <TerminalCard icon="qr" title="Tu QR" badge="Listo" body="Texto" action={{ href: "/pass", label: "Mostrar", kind: "chevron" }} />
      </div>,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("PixelGdgLogo", () => {
  it("is a valid 28x16 sprite in the four Google colors, each arm in three tones, with an outline", () => {
    expect(gdgLogoSprite.rows).toHaveLength(16);
    for (const row of gdgLogoSprite.rows) expect(row).toHaveLength(28);
    const flat = gdgLogoSprite.rows.join("");
    for (const key of new Set(flat.replace(/\./g, ""))) expect(gdgLogoSprite.palette).toHaveProperty(key);
    for (const key of ["R", "r", "1", "B", "b", "2", "G", "g", "3", "Y", "y", "4", "O"]) expect(flat.includes(key), `missing ${key}`).toBe(true);
    expect(gdgLogoSprite.palette.r).toBe("#ea4335");
    expect(gdgLogoSprite.palette.b).toBe("#4285f4");
    expect(gdgLogoSprite.palette.g).toBe("#34a853");
    expect(gdgLogoSprite.palette.y).toBe("#fbbc04");
  });

  it("keeps the two chevrons apart: a clear gap between the left and the right one", () => {
    const columns = (keys: string) => gdgLogoSprite.rows.flatMap((row) => [...row].flatMap((cell, x) => (keys.includes(cell) ? [x] : [])));
    const left = Math.max(...columns("Rr1Bb2"));
    const right = Math.min(...columns("Gg3Yy4"));

    expect(right - left).toBeGreaterThanOrEqual(4);
  });

  it("is mirrored: the right chevron is the left one flipped", () => {
    const shape = gdgLogoSprite.rows.map((row) => [...row].map((cell) => cell !== "."));
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 28; x += 1) expect(shape[y][x], `(${x},${y})`).toBe(shape[y][27 - x]);
  });

  it("renders crisp and decorative unless named", () => {
    const { container } = render(<PixelGdgLogo scale={2} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 28 16");
    expect(svg).toHaveAttribute("width", "56");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BrandMark", () => {
  it("shows the pixel wordmark, SPACE ARCADE and the tagline, and says the product's full name once", () => {
    render(<BrandMark titleAs="h1" />);

    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveAccessibleName(copy.brand.name);
    expect(title.className).toContain("type-pixel-title");
    expect(screen.getByText(copy.brand.arcade)).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(copy.brand.tagline)).toBeInTheDocument();
    expect(document.querySelector("svg[viewBox='0 0 28 16']")).toBeInTheDocument();
  });
});
