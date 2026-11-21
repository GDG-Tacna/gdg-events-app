// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "@/test-utils/axe";
import { BottomNav, type BottomNavProps } from "./BottomNav";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard" as string | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const PROPS: BottomNavProps = {
  label: "Navegación principal",
  start: [{ href: "/dashboard", label: "Inicio", icon: "home" }],
  action: { href: "/scan", label: "Escanear QR", icon: "qr" },
};

const renderNav = (props: BottomNavProps = PROPS) =>
  render(<BottomNav {...props} />);

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

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard",
      "/scan",
      "/missions",
    ]);
  });

  it("has only its tabs when there is no main action", () => {
    renderNav({
      label: "Navegación principal",
      start: [{ href: "/dashboard", label: "Inicio", icon: "home" }],
      end: [{ href: "/missions", label: "Misiones", icon: "home" }],
    });

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/dashboard", "/missions"]);
  });

  it("keeps the main action in the true middle when only one side has tabs: an empty slot balances the bar", () => {
    renderNav();

    const items = Array.from(
      screen.getByRole("navigation").querySelectorAll("ul > li"),
    );
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(items[1].querySelector('a[href="/scan"]')).not.toBeNull();
    expect(items[2]).toHaveAttribute("aria-hidden", "true");
    expect(items[2].className).toContain("flex-1");
  });

  it("balances the other side too, and adds no filler when both sides match", () => {
    const { unmount } = renderNav({
      ...PROPS,
      start: [],
      end: [{ href: "/m", label: "Misiones", icon: "home" }],
    });
    let items = Array.from(
      screen.getByRole("navigation").querySelectorAll("ul > li"),
    );
    expect(items[0]).toHaveAttribute("aria-hidden", "true");
    expect(items[1].querySelector('a[href="/scan"]')).not.toBeNull();
    unmount();

    renderNav({
      ...PROPS,
      end: [{ href: "/m", label: "Misiones", icon: "home" }],
    });
    items = Array.from(
      screen.getByRole("navigation").querySelectorAll("ul > li"),
    );
    expect(items).toHaveLength(3);
    expect(
      items.some((item) => item.getAttribute("aria-hidden") === "true"),
    ).toBe(false);
  });

  it("names the main action for assistive tech even though it is only an icon", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "Escanear QR" })).toHaveAttribute(
      "href",
      "/scan",
    );
  });

  it("marks the current tab, and only that one", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Escanear QR" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks the main action when its screen is open", () => {
    navigation.pathname = "/scan";
    renderNav();

    expect(screen.getByRole("link", { name: "Escanear QR" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows the current tab with a yellow icon and label (the readable yellow) and a mark over the bar's line, and no other tab", () => {
    navigation.pathname = "/dashboard";
    renderNav({
      ...PROPS,
      end: [{ href: "/map", label: "Mapa", icon: "map" }],
    });

    const current = screen.getByRole("link", { name: "Inicio" });
    expect(current.className).toContain("text-gold-ink");
    expect(current.className).not.toContain("bg-pastel-yellow");
    expect(current.parentElement?.querySelector("span.bg-gold")).not.toBeNull();

    const other = screen.getByRole("link", { name: "Mapa" });
    expect(other.className).not.toContain("text-gold-ink");
    expect(other.parentElement?.querySelector("span.bg-gold")).toBeNull();
  });

  it("hangs the main action from the bar's line instead of lifting it inside the bar", () => {
    renderNav();

    const action = screen.getByRole("link", { name: "Escanear QR" });
    expect(action.className).toContain("absolute");
    expect(action.className).toContain("-translate-y-1/2");
    // A ring of the bar's color cuts the line behind it.
    expect(action.className).toContain("ring-surface");
    expect(action.className).not.toContain("-translate-y-4");
  });

  it("marks a tab that opens with a query (the agenda) as current when its page is open", () => {
    navigation.pathname = "/map";
    renderNav({
      ...PROPS,
      end: [{ href: "/map?vista=agenda", label: "Agenda", icon: "calendar" }],
    });

    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a tab current on the pages below it, but not on a page that only shares a prefix", () => {
    navigation.pathname = "/dashboard/details";
    const { unmount } = renderNav();
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();

    navigation.pathname = "/dashboardx";
    renderNav();
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not mark a tab current on the pages below it that another tab claims (`exclude`)", () => {
    const props: BottomNavProps = {
      ...PROPS,
      start: [
        {
          href: "/staff",
          label: "Puestos",
          icon: "flag",
          exclude: ["/staff/mi-codigo"],
        },
      ],
      end: [{ href: "/staff/mi-codigo", label: "Mi código", icon: "person" }],
    };

    navigation.pathname = "/staff/mi-codigo";
    const { unmount } = renderNav(props);
    expect(screen.getByRole("link", { name: "Puestos" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Mi código" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();

    navigation.pathname = "/staff/serve/door";
    renderNav(props);
    expect(screen.getByRole("link", { name: "Puestos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("copes with a missing pathname (it is null outside the router)", () => {
    navigation.pathname = null;
    renderNav();

    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
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
