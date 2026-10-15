// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "@/test-utils/axe";
import { TextAreaField } from "./TextAreaField";

describe("TextAreaField", () => {
  it("ties the label, help and error to the field, and shows a counter hidden from assistive tech", () => {
    render(<TextAreaField label="Tema" hint="Cuenta de qué trata" error="Muy corto" counter={{ current: 4, max: 1500 }} value="Hola" readOnly />);

    const field = screen.getByRole("textbox", { name: "Tema" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAccessibleDescription("Cuenta de qué trata Muy corto");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("4/1500")).toHaveAttribute("aria-hidden", "true");
  });

  it("is plain without help or error, and has no detectable accessibility violations", async () => {
    const { container } = render(<TextAreaField label="Tema" defaultValue="" />);

    expect(screen.getByRole("textbox", { name: "Tema" })).not.toHaveAttribute("aria-describedby");
    expect((await axe(container)).violations).toEqual([]);
  });
});
