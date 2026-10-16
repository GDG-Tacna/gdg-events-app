import { describe, expect, it } from "vitest";
import { adminAreaCards, adminNavItems, readOnlyAreas } from "./admin-nav";

describe("admin navigation", () => {
  it("lists every area by default", () => {
    const hrefs = adminNavItems().map((item) => item.href);

    expect(hrefs).toContain("/admin/sorteo");
    expect(hrefs).toContain("/admin/team");
  });

  it("leaves out areas of modules switched off and sections the session may not see", () => {
    const hrefs = adminNavItems((module) => module !== "raffle", { economy: "none", squads: "view" }).map((item) => item.href);

    expect(hrefs).not.toContain("/admin/sorteo");
    expect(hrefs).not.toContain("/admin/economia");
    expect(hrefs).toContain("/admin/escuadrones");
    expect(hrefs[0]).toBe("/admin");
    expect(adminAreaCards(() => true, { economy: "none" }).map((card) => card.href)).not.toContain("/admin/economia");
  });

  it("names the areas the session may only look at", () => {
    expect(readOnlyAreas({ squads: "view", economy: "none", missions: "edit" })).toEqual(["/admin/escuadrones"]);
  });

  it("gives every area its group, after the home, and lists the zones next to the plan", () => {
    const items = adminNavItems();

    expect(items[0]).toMatchObject({ href: "/admin", exact: true });
    expect(items[0]).not.toHaveProperty("group");
    expect(items.slice(1).every((item) => typeof item.group === "string")).toBe(true);
    const program = items.filter((item) => item.group === "Programa").map((item) => item.href);
    expect(program).toEqual(["/admin/charlas", "/admin/speakers", "/admin/puestos", "/admin/zonas", "/admin/mapa"]);
  });

  it("hides the zones with the plan when the map is switched off, and makes both view-only together", () => {
    expect(adminNavItems((module) => module !== "map").map((item) => item.href)).not.toContain("/admin/zonas");
    expect(readOnlyAreas({ map: "view" })).toEqual(["/admin/zonas", "/admin/mapa"]);
  });
});
