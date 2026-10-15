import { describe, expect, it, vi } from "vitest";
import { FirstAdminError, grantFirstAdmin } from "../../scripts/first-admin-lib.mjs";

const NOW = new Date("2026-10-20T14:00:00Z");

function setup({ hasAdmin = false, user = { uid: "u1", email: "Ana@Example.com", displayName: "Ana", customClaims: { theme: "dark" } } } = {}) {
  const auth = {
    getUserByEmail: vi.fn(async () => {
      if (!user) throw Object.assign(new Error("none"), { code: "auth/user-not-found" });
      return user;
    }),
    setCustomUserClaims: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
  };
  const db = {
    hasAdmin: vi.fn(async () => hasAdmin),
    saveMember: vi.fn(async () => undefined),
    appendAudit: vi.fn(async () => undefined),
  };
  return { auth, db, run: (email: string) => grantFirstAdmin({ email, auth, db, now: () => NOW }) };
}

describe("grantFirstAdmin", () => {
  it("makes the account an admin: claim, forced sign-in, team record and audit entry", async () => {
    const t = setup();

    const result = await t.run("  ANA@example.com ");

    expect(result).toEqual({ uid: "u1", email: "ana@example.com" });
    expect(t.auth.getUserByEmail).toHaveBeenCalledWith("ana@example.com");
    expect(t.auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { theme: "dark", role: "admin" });
    expect(t.auth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
    expect(t.db.saveMember).toHaveBeenCalledWith("u1", {
      email: "ana@example.com",
      displayName: "Ana",
      role: "admin",
      updatedAt: NOW,
    });
    expect(t.db.appendAudit).toHaveBeenCalledWith({
      action: "role.granted",
      actorUid: "script:first-admin",
      targetUid: "u1",
      details: { role: "admin", previous: null },
      at: NOW,
    });
  });

  it("refuses when an admin already exists, and changes nothing", async () => {
    const t = setup({ hasAdmin: true });

    await expect(t.run("ana@example.com")).rejects.toMatchObject({ code: "admin-exists" });
    expect(t.auth.getUserByEmail).not.toHaveBeenCalled();
    expect(t.auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(t.db.saveMember).not.toHaveBeenCalled();
  });

  it("asks the person to sign in first when the account does not exist", async () => {
    const t = setup({ user: null as never });

    await expect(t.run("ghost@example.com")).rejects.toMatchObject({ code: "user-not-found" });
    expect(t.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it.each(["", "nope", "a@b"])("rejects %j as an email before reading anything", async (email) => {
    const t = setup();

    await expect(t.run(email)).rejects.toBeInstanceOf(FirstAdminError);
    expect(t.db.hasAdmin).not.toHaveBeenCalled();
  });

  it("passes unexpected failures through instead of hiding them", async () => {
    const t = setup();
    t.auth.getUserByEmail.mockRejectedValueOnce(new Error("network"));

    await expect(t.run("ana@example.com")).rejects.toThrow("network");
  });
});
