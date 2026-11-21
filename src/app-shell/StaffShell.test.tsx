// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { StaffShell } from "./StaffShell";

const navigation = vi.hoisted(() => ({ pathname: "/staff" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/features/auth", () => ({ SignOutButton: () => <button type="button">Cerrar sesión</button> }));
const features = vi.hoisted(() => ({ FEATURES: { checkins: true } }));
vi.mock("@/shared/config/features", () => features);

describe("StaffShell", () => {
  it("has a bottom bar with only the stations and the staff's own code: each station has its own reader, so no scan button in the middle", () => {
    navigation.pathname = "/staff";
    render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );

    const nav = screen.getByRole("navigation", { name: copy.staff.nav.label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/staff", "/staff/mi-codigo"]);
    expect(within(nav).getByRole("link", { name: copy.staff.nav.stations })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the team code button within reach above the bottom bar, as a link to the staff's code", () => {
    navigation.pathname = "/staff";
    features.FEATURES.checkins = true;
    render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );

    const button = screen.getByRole("link", { name: copy.teamCode.fabLabel });
    expect(button).toHaveAttribute("href", "/staff/mi-codigo");
    expect(button).toHaveTextContent(copy.teamCode.fab);
    expect(button.className).toContain("fixed");
    expect(button.className).toContain("bottom-[calc(6.25rem");
    expect(within(screen.getByRole("navigation", { name: copy.staff.nav.label })).queryByRole("link", { name: copy.teamCode.fabLabel })).not.toBeInTheDocument();
  });

  it("hides the team code button on the code's own screen, and when check-ins are off", () => {
    navigation.pathname = "/staff/mi-codigo";
    features.FEATURES.checkins = true;
    const { unmount } = render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );
    expect(screen.queryByRole("link", { name: copy.teamCode.fabLabel })).not.toBeInTheDocument();
    unmount();

    navigation.pathname = "/staff";
    features.FEATURES.checkins = false;
    render(
      <StaffShell account="Bruno">
        <p>x</p>
      </StaffShell>,
    );
    expect(screen.queryByRole("link", { name: copy.teamCode.fabLabel })).not.toBeInTheDocument();
    features.FEATURES.checkins = true;
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
