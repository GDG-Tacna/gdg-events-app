// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { BottomNav, type BottomNavProps } from "./BottomNav";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const PROPS: BottomNavProps = {
  label: "Navegación principal",
  start: [{ href: "/dashboard", label: "Inicio", icon: "home" }],
  action: { href: "/scan", label: "Escanear QR", icon: "qr" },
};

const renderNav = (props: BottomNavProps = PROPS) => render(<BottomNav {...props} />);

describe("BottomNav", () => {
  beforeEach(() => {
    navigation.pathname = "/dashboard";
  });

  it("puts the main action in the middle, between the tabs on each side", () => {
    renderNav({
      ...PROPS,
      start: [{ href: "/dashboard", label: "Inicio", icon: "home" }],
      end: [{ href: "/missions", label: "Misiones", icon: "home" }],
    });

    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/dashboard", "/scan", "/missions"]);
  });

  it("keeps the main action in the true middle when only one side has tabs: an empty slot balances the bar", () => {
    renderNav();

    const items = Array.from(screen.getByRole("navigation").querySelectorAll("ul > li"));
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(items[1].querySelector('a[href="/scan"]')).not.toBeNull();
    expect(items[2]).toHaveAttribute("aria-hidden", "true");
    expect(items[2].className).toContain("flex-1");
  });

  it("balances the other side too, and adds no filler when both sides match", () => {
    const { unmount } = renderNav({ ...PROPS, start: [], end: [{ href: "/m", label: "Misiones", icon: "home" }] });
    let items = Array.from(screen.getByRole("navigation").querySelectorAll("ul > li"));
    expect(items[0]).toHaveAttribute("aria-hidden", "true");
    expect(items[1].querySelector('a[href="/scan"]')).not.toBeNull();
    unmount();

    renderNav({ ...PROPS, end: [{ href: "/m", label: "Misiones", icon: "home" }] });
    items = Array.from(screen.getByRole("navigation").querySelectorAll("ul > li"));
    expect(items).toHaveLength(3);
    expect(items.some((item) => item.getAttribute("aria-hidden") === "true")).toBe(false);
  });

  it("names the main action for assistive tech even though it is only an icon", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "Escanear QR" })).toHaveAttribute("href", "/scan");
  });

  it("marks the current tab, and only that one", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Escanear QR" })).not.toHaveAttribute("aria-current");
  });

  it("marks the main action when its screen is open", () => {
    navigation.pathname = "/scan";
    renderNav();

    expect(screen.getByRole("link", { name: "Escanear QR" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("keeps a tab current on the pages below it, but not on a page that only shares a prefix", () => {
    navigation.pathname = "/dashboard/details";
    const { unmount } = renderNav();
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    unmount();

    navigation.pathname = "/dashboardx";
    renderNav();
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("copes with a missing pathname (it is null outside the router)", () => {
    navigation.pathname = null;
    renderNav();

    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("has a solid fill, so contrast never depends on the blur", () => {
    renderNav();

    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("bg-surface");
    expect(nav.className).toContain("supports-[backdrop-filter]:backdrop-blur");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderNav();

    expect((await axe(container)).violations).toEqual([]);
  });
});
