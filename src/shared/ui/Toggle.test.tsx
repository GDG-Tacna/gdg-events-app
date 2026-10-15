// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("is named by its label and described by its help", () => {
    render(<Toggle label="Ofrecer" help="Se puede volver a activar." checked={false} onChange={vi.fn()} />);

    const box = screen.getByRole("checkbox", { name: "Ofrecer" });
    expect(box).toHaveAccessibleDescription("Se puede volver a activar.");
  });

  it("toggles from anywhere on its row, and not while disabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle label="Ofrecer" help="Ayuda" checked={false} onChange={onChange} />);

    fireEvent.click(screen.getByText("Ayuda"));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Toggle label="Ofrecer" checked onChange={onChange} disabled />);
    expect(screen.getByRole("checkbox", { name: "Ofrecer" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toHaveAttribute("aria-describedby");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<Toggle label="Ofrecer" help="Ayuda" checked onChange={vi.fn()} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
