import type { Auth } from "firebase-admin/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminAuth: () => { throw new Error("must be injected"); } }));

const { FirebaseRoleDirectory } = await import("./firebase-role-directory");

function fakeAuth(claims: Record<string, unknown> | undefined = {}) {
  const auth = {
    getUserByEmail: vi.fn(async (email: string) => {
      if (email === "ghost@example.com") throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      if (email === "down@example.com") throw Object.assign(new Error("network"), { code: "app/network-error" });
      return { uid: "u1", email: "Ana@Example.com", displayName: "Ana" };
    }),
    getUser: vi.fn(async () => ({ customClaims: claims })),
    setCustomUserClaims: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
  };
  return { auth, directory: new FirebaseRoleDirectory(() => auth as unknown as Auth) };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("FirebaseRoleDirectory.findByEmail", () => {
  it("finds the account and normalizes its email", async () => {
    const { directory } = fakeAuth();

    expect(await directory.findByEmail("ana@example.com")).toEqual({
      ok: true,
      value: { uid: "u1", email: "ana@example.com", displayName: "Ana" },
    });
  });

  it("returns null when nobody signed in with that email", async () => {
    const { directory } = fakeAuth();

    expect(await directory.findByEmail("ghost@example.com")).toEqual({ ok: true, value: null });
  });

  it("reports other failures as unknown instead of pretending the person does not exist", async () => {
    const { directory } = fakeAuth();

    expect(await directory.findByEmail("down@example.com")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});

describe("FirebaseRoleDirectory.setRole", () => {
  it("sets the role claim, keeps the other claims and forces a fresh sign-in", async () => {
    const { auth, directory } = fakeAuth({ theme: "dark", role: "attendee" });

    const result = await directory.setRole("u1", "staff");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { theme: "dark", role: "staff" });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
  });

  it("clears only the role claim when the role is removed", async () => {
    const { auth, directory } = fakeAuth({ theme: "dark", role: "admin" });

    await directory.setRole("u1", null);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { theme: "dark" });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
  });

  it("works for an account without any claims", async () => {
    const { auth, directory } = fakeAuth(undefined);

    await directory.setRole("u1", "admin");

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { role: "admin" });
  });

  it("does not revoke sessions when the claim could not be written", async () => {
    const { auth, directory } = fakeAuth({});
    auth.setCustomUserClaims.mockRejectedValueOnce(new Error("boom"));

    expect(await directory.setRole("u1", "staff")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});
