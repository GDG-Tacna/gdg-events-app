// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScanReticle } from "./ScanReticle";

describe("ScanReticle", () => {
  it("is decoration over the camera: hidden from assistive tech and never in the way of taps", () => {
    render(<ScanReticle active />);

    const reticle = screen.getByTestId("scan-reticle");
    expect(reticle).toHaveAttribute("aria-hidden", "true");
    expect(reticle.className).toContain("pointer-events-none");
  });

  it("sweeps while looking, and rests otherwise", () => {
    const { container, rerender } = render(<ScanReticle active />);
    expect(container.querySelector(".animate-reticle-sweep")).not.toBeNull();

    rerender(<ScanReticle active={false} />);
    expect(container.querySelector(".animate-reticle-sweep")).toBeNull();
  });

  it("holds still under reduced motion: the sweeping line is hidden", () => {
    const { container } = render(<ScanReticle active />);

    expect(container.querySelector(".animate-reticle-sweep")?.parentElement?.className).toContain("motion-reduce:hidden");
  });

  it.each([
    ["idle", "text-cyan"],
    ["success", "text-lime"],
    ["error", "text-danger"],
  ] as const)("tints the ring for %s", (tone, className) => {
    render(<ScanReticle active={false} tone={tone} />);

    expect(screen.getByTestId("scan-reticle").className).toContain(className);
  });
});
