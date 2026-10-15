// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test-utils/axe";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  ButtonLink,
  Card,
  Icon,
  InlineAlert,
  PixelPlanet,
  PixelShip,
  Skeleton,
  TextField,
} from "./index";

describe("TextField", () => {
  it("ties the label to the input so clicking or reading the label reaches the field", () => {
    render(<TextField label="Alias de cadete" />);

    expect(screen.getByLabelText("Alias de cadete")).toBeInstanceOf(HTMLInputElement);
  });

  it("describes the input with the hint", () => {
    render(<TextField label="Alias" hint="De 3 a 16 caracteres" />);

    expect(screen.getByLabelText("Alias")).toHaveAccessibleDescription("De 3 a 16 caracteres");
  });

  it("marks the input invalid and announces the error, keeping the hint in the description", () => {
    render(<TextField label="Alias" hint="De 3 a 16 caracteres" error="Ese alias ya está en uso." />);
    const input = screen.getByLabelText("Alias");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Ese alias ya está en uso.");
    expect(input).toHaveAccessibleDescription("De 3 a 16 caracteres Ese alias ya está en uso.");
  });

  it("is valid and silent without an error", () => {
    render(<TextField label="Alias" hint="Ayuda" />);

    expect(screen.getByLabelText("Alias")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a visual counter that assistive tech does not read twice", () => {
    render(<TextField label="Alias" counter={{ current: 7, max: 16 }} maxLength={16} />);

    expect(screen.getByText("7/16")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Alias")).toHaveAttribute("maxlength", "16");
  });

  it("forwards typing to the caller", async () => {
    const onChange = vi.fn();
    render(<TextField label="Alias" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Alias"), "Nova");

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText("Alias")).toHaveValue("Nova");
  });

  it("keeps a 48px height and 16px text so mobile browsers do not zoom on focus", () => {
    render(<TextField label="Alias" />);
    const classes = screen.getByLabelText("Alias").className.split(/\s+/);

    expect(classes).toContain("h-12");
    expect(classes).toContain("text-base");
    expect(classes).toContain("md:text-base");
  });

  it("shows the placeholder subtler than typed text", () => {
    render(<TextField label="Alias" placeholder="Nova_7" />);
    const classes = screen.getByLabelText("Alias").className.split(/\s+/);

    expect(classes).toContain("placeholder:text-text-subtle");
    expect(classes).not.toContain("placeholder:text-muted-foreground");
  });

  it("overrides the primitive dark fill so the field matches the Design System", () => {
    render(<TextField label="Alias" />);
    const classes = screen.getByLabelText("Alias").className.split(/\s+/);

    expect(classes).toContain("dark:bg-bg-deep");
    expect(classes).not.toContain("dark:bg-input/30");
  });

  it("has no detectable accessibility violations (plain and with an error)", async () => {
    const { container, rerender } = render(<TextField label="Alias" hint="Ayuda" counter={{ current: 0, max: 16 }} />);
    expect((await axe(container)).violations).toEqual([]);

    rerender(<TextField label="Alias" hint="Ayuda" error="Error" counter={{ current: 0, max: 16 }} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("Button", () => {
  it("fires onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Escanear QR</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Escanear QR" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is busy and inert while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Conectando…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Conectando…" });

    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps a 44px+ touch target at every size except the compact one", () => {
    render(
      <>
        <Button size="md">md</Button>
        <Button size="lg">lg</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "md" }).className).toContain("h-12");
    expect(screen.getByRole("button", { name: "lg" }).className).toContain("h-14");
  });

  it("lets the caller class override the variant background", () => {
    render(<Button className="bg-gold">x</Button>);

    const classes = screen.getByRole("button", { name: "x" }).className.split(/\s+/);
    expect(classes).toContain("bg-gold");
    expect(classes).not.toContain("bg-primary");
  });
});

describe("Card", () => {
  it("keeps an opaque surface fill (a transparent card lets the starfield show through)", () => {
    const { container } = render(<Card>contenido</Card>);
    const classes = (container.firstElementChild as HTMLElement).className.split(/\s+/);

    expect(classes).toContain("bg-card");
    expect(classes).toContain("shadow-card");
  });

  it("keeps the card elevation when the cyan glow is on", () => {
    const { container } = render(<Card tone="cyan">contenido</Card>);
    const className = (container.firstElementChild as HTMLElement).className;

    expect(className).toContain("bg-card");
    expect(className).toContain("--shadow-card");
    expect(className).toContain("--shadow-glow-cyan");
  });
});

describe("ButtonLink", () => {
  it("is a real link, not a button", () => {
    render(<ButtonLink href="/login">Volver</ButtonLink>);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/login");
  });
});

describe("InlineAlert", () => {
  it("announces its message as an alert", () => {
    render(<InlineAlert>Algo salió mal</InlineAlert>);

    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal");
  });
});

describe("Icon", () => {
  it("is hidden from assistive tech unless it has a title", () => {
    const { container, rerender } = render(<Icon name="alert" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    rerender(<Icon name="alert" title="Error" />);
    expect(screen.getByRole("img", { name: "Error" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is decorative", () => {
    const { container } = render(<Skeleton className="h-4" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("pixel art", () => {
  it("renders the planet on a 16x16 grid with crisp edges and no accessible name by default", () => {
    const { container } = render(<PixelPlanet scale={3} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  it("renders the ship on a 24x11 grid and exposes its title when given", () => {
    render(<PixelShip scale={4} title="Nave" />);

    const svg = screen.getByRole("img", { name: "Nave" });
    expect(svg).toHaveAttribute("viewBox", "0 0 24 11");
    expect(svg).toHaveAttribute("width", "96");
  });

  it("only paints inside the grid", () => {
    const { container } = render(<PixelPlanet />);

    for (const rect of container.querySelectorAll("rect")) {
      const x = Number(rect.getAttribute("x"));
      const y = Number(rect.getAttribute("y"));
      const width = Number(rect.getAttribute("width"));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(16);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(16);
    }
  });
});

describe("accessibility", () => {
  it("has no detectable violations in a card with a button and an alert", async () => {
    const { container } = render(
      <main>
        <Card tone="cyan">
          <h1>Título</h1>
          <InlineAlert>Mensaje</InlineAlert>
          <Button>Continuar</Button>
          <ButtonLink href="/">Inicio</ButtonLink>
        </Card>
      </main>,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
