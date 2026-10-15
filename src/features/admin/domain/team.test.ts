import { describe, expect, it } from "vitest";
import { isManagedRole, normalizeEmail } from "./team";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana.Perez@Example.COM ")).toBe("ana.perez@example.com");
  });

  it.each(["", " ", "plain", "no-domain@", "@no-user.com", "a@b", "has space@x.com", "a@@x.com"])(
    "rejects %j",
    (input) => {
      expect(normalizeEmail(input)).toBeNull();
    },
  );

  it("rejects an address longer than the standard allows", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
  });
});

describe("isManagedRole", () => {
  it("manages staff and admin only: attendee comes from registering", () => {
    expect(isManagedRole("staff")).toBe(true);
    expect(isManagedRole("admin")).toBe(true);
    expect(isManagedRole("attendee")).toBe(false);
    expect(isManagedRole("root")).toBe(false);
    expect(isManagedRole(undefined)).toBe(false);
  });
});
