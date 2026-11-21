// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { QuickCodeButton } from "./QuickCodeButton";

const navigation = vi.hoisted(() => ({ pathname: "/admin" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const props = { href: "/staff/mi-codigo", label: "Mi QR", accessibleLabel: "Mostrar mi código" };

describe("QuickCodeButton", () => {
  it("is a link with its own accessible name that leads to the code and floats within the safe area", () => {
    navigation.pathname = "/admin";
    render(<QuickCodeButton {...props} />);

    const link = screen.getByRole("link", { name: "Mostrar mi código" });
    expect(link).toHaveAttribute("href", "/staff/mi-codigo");
    expect(link).toHaveTextContent("Mi QR");
    expect(link.className).toContain("fixed");
    expect(link.className).toContain("env(safe-area-inset-bottom)");
    expect(link.className).toContain("print:hidden");
  });

  it("takes the classes it is given, to sit above a bottom bar", () => {
    navigation.pathname = "/staff";
    render(<QuickCodeButton {...props} className="bottom-24" />);

    expect(screen.getByRole("link", { name: "Mostrar mi código" }).className).toContain("bottom-24");
  });

  it("is not shown on the code's own screen, nor without a path", () => {
    navigation.pathname = "/staff/mi-codigo";
    const { unmount } = render(<QuickCodeButton {...props} />);
    expect(screen.queryByRole("link", { name: "Mostrar mi código" })).not.toBeInTheDocument();
    unmount();

    navigation.pathname = null;
    render(<QuickCodeButton {...props} />);
    expect(screen.getByRole("link", { name: "Mostrar mi código" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    navigation.pathname = "/admin";
    const { container } = render(<QuickCodeButton {...props} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
