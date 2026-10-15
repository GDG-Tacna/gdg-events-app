// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { AttendeeShell } from "./AttendeeShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
const features = vi.hoisted(() => ({ FEATURES: { missions: true, map: true, achievements: true } }));
vi.mock("@/shared/config/features", () => features);

describe("AttendeeShell", () => {
  it("leaves the Logros tab out when achievements are off", async () => {
    features.FEATURES.achievements = false;
    render(await AttendeeShell({ children: <p>x</p> }));
    features.FEATURES.achievements = true;

    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    expect(within(nav).queryByRole("link", { name: copy.nav.achievements })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: copy.nav.map })).toBeInTheDocument();
  });

  it("shows the page with the main navigation: home and missions on the left, the scanner in the middle, the map and the achievements on the right", async () => {
    render(await AttendeeShell({ children: <h1>Contenido</h1> }));

    expect(screen.getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/dashboard", "/missions", "/scan", "/map", "/achievements"]);
    expect(within(nav).getByRole("link", { name: copy.nav.achievements })).toHaveAttribute("href", "/achievements");
    expect(within(nav).getByRole("link", { name: copy.nav.map })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: copy.nav.home })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: copy.nav.scan })).toBeInTheDocument();
  });

  it("makes room for the bar so it never covers the end of a page", async () => {
    const { container } = render(await AttendeeShell({ children: <p>x</p> }));

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("pb-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(frame.className).toContain("min-[760px]:pl-24");
  });
});
