import { describe, expect, it } from "vitest";
import { ROUTES, homeFor } from "./routes";

describe("homeFor", () => {
  it.each([
    ["attendee", "/dashboard"],
    ["staff", "/staff"],
    ["admin", "/admin"],
    [null, "/onboarding"],
  ] as const)("%s lands on %s", (role, path) => {
    expect(homeFor(role)).toBe(path);
  });

  it("uses the same paths as the route table", () => {
    expect(homeFor("attendee")).toBe(ROUTES.dashboard);
    expect(homeFor("staff")).toBe(ROUTES.staff);
    expect(homeFor("admin")).toBe(ROUTES.admin);
  });

  it("falls back to onboarding for anything unexpected instead of throwing", () => {
    expect(homeFor("owner" as never)).toBe("/onboarding");
  });
});
