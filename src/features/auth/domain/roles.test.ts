import { describe, expect, it } from "vitest";
import { ROLES, canAccess, isRole } from "./roles";

describe("isRole", () => {
  it.each(ROLES)("accepts %s", (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each([undefined, null, "", "owner", 1, {}])("rejects %j", (value) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("canAccess", () => {
  it("denies a user without a role", () => {
    expect(canAccess(null, ["attendee"])).toBe(false);
  });

  it("allows a role listed for the surface", () => {
    expect(canAccess("attendee", ["attendee"])).toBe(true);
    expect(canAccess("staff", ["staff", "admin"])).toBe(true);
  });

  it("denies a role that is not listed", () => {
    expect(canAccess("attendee", ["staff"])).toBe(false);
    expect(canAccess("staff", ["admin"])).toBe(false);
  });

  it("lets admin reach every surface", () => {
    expect(canAccess("admin", ["attendee"])).toBe(true);
    expect(canAccess("admin", [])).toBe(true);
  });
});
