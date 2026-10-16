// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/insights.server", () => ({ insightsDeps: { marker: "insights" } }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const insightsServer = vi.hoisted(() => ({ getInsights: vi.fn() }));
vi.mock("@/features/insights/server", () => insightsServer);

const { default: AdminHomePage } = await import("./page");

const OVERVIEW = {
  current: { eventId: "devfest-2026", registered: 200, attended: 150, talkCheckIns: 320, standVisits: 90, missionsCompleted: 410, contacts: 75, rations: [{ checkpointId: "lunch", name: "Almuerzo", count: 120 }] },
  past: [{ eventId: "devfest-2025", registered: 180, attended: 140 }],
};

describe("admin home page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    insightsServer.getInsights.mockResolvedValue({ ok: true, value: OVERVIEW });
  });

  it("checks the admin role itself and reads the numbers as that admin", async () => {
    await AdminHomePage();

    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(insightsServer.getInsights).toHaveBeenCalledWith({ marker: "insights" }, { uid: "a1", role: "admin" });
  });

  it("stops before reading anything when the guard stops the request", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminHomePage()).rejects.toThrow("not-found");
    expect(insightsServer.getInsights).not.toHaveBeenCalled();
  });

  it("shows the edition's numbers, and keeps the shortcuts when they cannot be read", async () => {
    const { unmount } = render(await AdminHomePage());
    expect(screen.getByRole("list", { name: copy.admin.home.stats.label })).toHaveTextContent("200");
    unmount();

    insightsServer.getInsights.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    render(await AdminHomePage());
    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.home.error);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(10);
  });

  it("offers a shortcut with an icon to each module, in the navigation's order", async () => {
    render(await AdminHomePage());

    const shortcuts = within(screen.getByRole("region", { name: copy.admin.home.shortcutsTitle }));
    const links = shortcuts.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/admin/eventos",
      "/admin/team",
      "/admin/charlas",
      "/admin/speakers",
      "/admin/puestos",
      "/admin/zonas",
      "/admin/mapa",
      "/admin/misiones",
      "/admin/odisea",
      "/admin/minijuegos",
      "/admin/logros",
      "/admin/rangos",
      "/admin/escuadrones",
      "/admin/creditos-escuadron",
      "/admin/economia",
      "/admin/sorteo",
      "/admin/escenario",
      "/admin/encuestas",
    ]);
    expect(links[0]).toHaveAccessibleName(copy.admin.areas.event.title);
    for (const link of links) expect(link.querySelector("svg")).toBeInTheDocument();
  });

  it("groups the shortcuts like the menu, each group under its name", async () => {
    render(await AdminHomePage());

    const g = copy.admin.navGroups;
    const groups = [g.event, g.program, g.game, g.rewards, g.live];
    for (const name of groups) expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: g.program })).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/admin/charlas",
      "/admin/speakers",
      "/admin/puestos",
      "/admin/zonas",
      "/admin/mapa",
    ]);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(await AdminHomePage());

    expect((await axe(container)).violations).toEqual([]);
  });
});
