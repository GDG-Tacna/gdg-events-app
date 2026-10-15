// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { SelectField } from "./SelectField";

const OPTIONS = [
  { value: "ai", label: "AI" },
  { value: "cloud", label: "Google Cloud" },
];

describe("SelectField", () => {
  it("ties the label, the help and the error to a native select", () => {
    const onChange = vi.fn();
    render(<SelectField label="Cuadrante" hint="Elige uno" error="Ese no existe" options={OPTIONS} value="ai" onChange={onChange} />);

    const select = screen.getByRole("combobox", { name: "Cuadrante" });
    expect(select).toHaveAccessibleDescription("Elige uno Ese no existe");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["AI", "Google Cloud"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Ese no existe");

    fireEvent.change(select, { target: { value: "cloud" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("is plain when there is no help or error", () => {
    render(<SelectField label="Tipo" options={OPTIONS} defaultValue="ai" />);

    const select = screen.getByRole("combobox", { name: "Tipo" });
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(select).not.toHaveAttribute("aria-describedby");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<SelectField label="Tipo" hint="Ayuda" options={OPTIONS} defaultValue="ai" />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
