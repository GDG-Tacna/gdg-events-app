// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { StaffShell } from "./StaffShell";

const navigation = vi.hoisted(() => ({ pathname: "/staff" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/features/auth", () => ({ SignOutButton: () => <button type="button">Cerrar sesión</button> }));

describe("StaffShell", () => {
  it("has a bottom bar with the stations, the ticket change in the middle and the staff's own code", () => {
    navigation.pathname = "/staff";
    render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );

    const nav = screen.getByRole("navigation", { name: copy.staff.nav.label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/staff", "/staff/entradas", "/staff/mi-codigo"]);
    expect(within(nav).getByRole("link", { name: copy.staff.nav.stations })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Puestos current on a station's page but not on the other tabs' pages", () => {
    navigation.pathname = "/staff/serve/door";
    const { unmount } = render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );
    expect(screen.getByRole("link", { name: copy.staff.nav.stations })).toHaveAttribute("aria-current", "page");
    unmount();

    navigation.pathname = "/staff/mi-codigo";
    render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );
    expect(screen.getByRole("link", { name: copy.staff.nav.stations })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: copy.staff.nav.code })).toHaveAttribute("aria-current", "page");
  });

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
