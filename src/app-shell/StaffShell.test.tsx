// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { StaffShell } from "./StaffShell";

vi.mock("@/features/auth", () => ({ SignOutButton: () => <button type="button">Cerrar sesión</button> }));

describe("StaffShell", () => {
  it("shows the page with who is signed in and the way out", () => {
    render(
      <StaffShell account="Bruno Mamani">
        <h1>Contenido</h1>
      </StaffShell>,
    );

    expect(screen.getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    expect(screen.getByText(copy.staff.brand)).toBeInTheDocument();
    expect(screen.getByText("Bruno Mamani")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("falls back to a generic label when the account has no name", () => {
    render(
      <StaffShell account={null}>
        <p>x</p>
      </StaffShell>,
    );

    expect(screen.getByLabelText(copy.staff.accountLabel)).toHaveTextContent(copy.staff.accountLabel);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <StaffShell account="Bruno">
        <h1>Contenido</h1>
      </StaffShell>,
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
