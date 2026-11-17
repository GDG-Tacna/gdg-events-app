// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { ok } from "@/shared/lib/result";
import { AttendeeShell } from "./AttendeeShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
const features = vi.hoisted(() => ({ FEATURES: { missions: true, map: true, achievements: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const renderShell = (shell: ReactElement) => render(<AuthActionsProvider actions={actions}>{shell}</AuthActionsProvider>);

const actions: AuthActions = {
  signInWithGoogle: vi.fn(async () => ok("signed-in" as const)),
  completeSignIn: vi.fn(async () => ok(false)),
  refreshSession: vi.fn(async () => ok(undefined)),
  signOut: vi.fn(async () => ok(undefined)),
};

describe("AttendeeShell", () => {
  it("starts every tab with the event's brand and a way to sign out, above the page", async () => {
    renderShell(await AttendeeShell({ children: <h1>Contenido</h1> }));

    const header = screen.getByRole("banner");
    expect(within(header).getByText(copy.brand.name)).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: copy.auth.signOut })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: copy.auth.signOut })).toHaveLength(1);
    // Above the page, so it is the first thing on every tab.
    expect(header.compareDocumentPosition(screen.getByRole("heading", { name: "Contenido" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leaves the Logros tab out when achievements are off", async () => {
    features.FEATURES.achievements = false;
    renderShell(await AttendeeShell({ children: <p>x</p> }));
    features.FEATURES.achievements = true;

    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    expect(within(nav).queryByRole("link", { name: copy.nav.achievements })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: copy.nav.map })).toBeInTheDocument();
  });

  it("shows the page with the main navigation: home and missions on the left, the scanner in the middle, the map and the achievements on the right", async () => {
    renderShell(await AttendeeShell({ children: <h1>Contenido</h1> }));

    expect(screen.getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/dashboard", "/missions", "/scan", "/map", "/achievements"]);
    expect(within(nav).getByRole("link", { name: copy.nav.achievements })).toHaveAttribute("href", "/achievements");
    expect(within(nav).getByRole("link", { name: copy.nav.map })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: copy.nav.home })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: copy.nav.scan })).toBeInTheDocument();
  });

  it("makes room for the bar so it never covers the end of a page", async () => {
    const { container } = renderShell(await AttendeeShell({ children: <p>x</p> }));

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("pb-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(frame.className).toContain("min-[760px]:pl-24");
  });

  it("leaves out the tab of every module switched off, and keeps the agenda as its own tab without the map", async () => {
    Object.assign(features.FEATURES, { missions: false, map: false, achievements: false });
    renderShell(await AttendeeShell({ children: <p>x</p> }));
    Object.assign(features.FEATURES, { missions: true, map: true, achievements: true });

    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/dashboard", "/scan", "/map?vista=agenda"]);
    expect(within(nav).getByRole("link", { name: copy.nav.agenda })).toBeInTheDocument();
  });
});
