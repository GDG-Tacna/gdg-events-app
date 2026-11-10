import type { Auth } from "firebase-admin/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminAuth: () => { throw new Error("must be injected"); } }));

const { FirebaseAccountDirectory } = await import("./firebase-account-directory");

function fakeAuth() {
  const auth = {
    getUser: vi.fn(),
    updateUser: vi.fn(async () => ({})),
    revokeRefreshTokens: vi.fn(async () => undefined),
  };
  return { auth, directory: new FirebaseAccountDirectory(() => auth as unknown as Auth) };
}

describe("FirebaseAccountDirectory", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("reads an account's email, name, role claim and whether it is disabled", async () => {
    const { auth, directory } = fakeAuth();
    auth.getUser.mockResolvedValue({ email: "nova@example.com", displayName: "Nova", customClaims: { role: "staff" }, disabled: true });

    expect(await directory.lookup("u1")).toEqual({ ok: true, value: { email: "nova@example.com", displayName: "Nova", role: "staff", disabled: true } });
  });

  it("tolerates an account with no email, name or claims", async () => {
    const { auth, directory } = fakeAuth();
    auth.getUser.mockResolvedValue({ disabled: false });

    expect(await directory.lookup("u1")).toEqual({ ok: true, value: { email: null, displayName: null, role: null, disabled: false } });
  });

  it("answers null for an account that does not exist, and unknown for any other failure", async () => {
    const { auth, directory } = fakeAuth();
    auth.getUser.mockRejectedValueOnce(Object.assign(new Error("none"), { code: "auth/user-not-found" }));
    expect(await directory.lookup("u1")).toEqual({ ok: true, value: null });

    auth.getUser.mockRejectedValueOnce(new Error("offline"));
    expect(await directory.lookup("u1")).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("disables an account and signs the person out everywhere, so it applies at once", async () => {
    const { auth, directory } = fakeAuth();

    expect(await directory.setDisabled("u1", true)).toEqual({ ok: true, value: undefined });

    expect(auth.updateUser).toHaveBeenCalledWith("u1", { disabled: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
  });

  it("enables an account again without touching its sessions", async () => {
    const { auth, directory } = fakeAuth();

    expect(await directory.setDisabled("u1", false)).toEqual({ ok: true, value: undefined });

    expect(auth.updateUser).toHaveBeenCalledWith("u1", { disabled: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("reports a failure to disable or enable", async () => {
    const { auth, directory } = fakeAuth();
    auth.updateUser.mockRejectedValueOnce(new Error("offline"));

    expect(await directory.setDisabled("u1", true)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});
