// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { formatNumber } from "@/shared/lib/format";
import { PixelStar, ProgressBar, RankChip, Stat } from "./index";

describe("RankChip", () => {
  it("shows the level in the pixel font and the rank name", () => {
    render(<RankChip level={3} name="Comandante" />);

    expect(screen.getByText("NV 3").className).toContain("type-pixel-tag");
    expect(screen.getByText("Comandante")).toBeInTheDocument();
  });
});

describe("ProgressBar", () => {
  it("exposes the real value to assistive tech", () => {
    render(<ProgressBar value={750} max={2000} label="Progreso" valueText="750 de 2000 XP" />);
    const bar = screen.getByRole("progressbar", { name: "Progreso" });

    expect(bar).toHaveAttribute("aria-valuenow", "750");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "2000");
    expect(bar).toHaveAttribute("aria-valuetext", "750 de 2000 XP");
  });

  it("fills to the percentage once mounted", () => {
    render(<ProgressBar value={25} label="Progreso" />);

    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "25%" });
  });

  it("follows the value when it changes", () => {
    const { rerender } = render(<ProgressBar value={20} label="Progreso" />);
    rerender(<ProgressBar value={80} label="Progreso" />);

    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "80%" });
  });

  it.each([
    [-10, 100, "0%", "0"],
    [250, 100, "100%", "100"],
    [Number.NaN, 100, "0%", "0"],
    [5, 0, "0%", "0"], // a zero or invalid max must not divide by zero
  ] as const)("clamps value %s of %s to a sane bar (%s)", (value, max, width, now) => {
    render(<ProgressBar value={value} max={max} label="Progreso" />);
    const bar = screen.getByRole("progressbar");

    expect(bar.firstElementChild).toHaveStyle({ width });
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(Math.max(max, 0));
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(0);
    if (max > 0) expect(bar).toHaveAttribute("aria-valuenow", now);
  });

  it("grows from empty on first paint and eases later changes, with the Design System duration and easing", () => {
    render(<ProgressBar value={50} label="Progreso" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;

    expect(fill.className).toContain("animate-progress-grow");
    expect(fill.className).toContain("duration-[600ms]");
    expect(fill.className).toContain("cubic-bezier(0.2,0.8,0.2,1)");
  });
});

describe("Stat", () => {
  it("shows the number with its label and the decorative icon", () => {
    const { container } = render(<Stat icon={<PixelStar />} value={1250} label="XP Estelar" />);

    expect(screen.getByText(formatNumber(1250))).toBeInTheDocument();
    expect(screen.getByText("XP Estelar")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [-5, "-5"],
  ] as const)("formats %i", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it("groups thousands and is stable between server and client", () => {
    expect(formatNumber(1250)).toBe(formatNumber(1250));
    expect(formatNumber(1250)).not.toBe("1250");
    expect(formatNumber(1250).replace(/\D/g, "")).toBe("1250");
  });

  it("drops decimals and treats invalid numbers as zero", () => {
    expect(formatNumber(12.9)).toBe("12");
    expect(formatNumber(Number.NaN)).toBe("0");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("accessibility", () => {
  it("has no detectable violations", async () => {
    const { container } = render(
      <main>
        <RankChip level={2} name="Piloto" />
        <ProgressBar value={40} label="Progreso hacia el siguiente rango" valueText="40 de 100 XP" />
        <Stat icon={<PixelStar />} value={120} label="XP Estelar" />
      </main>,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
