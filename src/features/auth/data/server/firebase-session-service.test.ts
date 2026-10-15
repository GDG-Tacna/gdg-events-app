import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const adminAuth = {
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};

vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminAuth: () => adminAuth }));

const { FirebaseSessionService } = await import("./firebase-session-service");

const nowSeconds = () => Math.floor(Date.now() / 1000);
const firebaseError = (code: string) => Object.assign(new Error(code), { code });

describe("FirebaseSessionService", () => {
  const service = new FirebaseSessionService();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("create", () => {
    it("mints a session cookie for a recently signed-in user", async () => {
      adminAuth.verifyIdToken.mockResolvedValue({ auth_time: nowSeconds() - 30 });
      adminAuth.createSessionCookie.mockResolvedValue("session-cookie");

      const result = await service.create("id-token");

      expect(adminAuth.verifyIdToken).toHaveBeenCalledWith("id-token", true);
      expect(result.ok && result.value.value).toBe("session-cookie");
      expect(result.ok && result.value.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("asks for a fresh sign-in when the token is older than five minutes", async () => {
      adminAuth.verifyIdToken.mockResolvedValue({ auth_time: nowSeconds() - 6 * 60 });

      const result = await service.create("id-token");

      expect(result).toEqual({ ok: false, error: { code: "recent-sign-in-required" } });
      expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
    });

    it("maps an invalid or expired token to invalid-credential", async () => {
      adminAuth.verifyIdToken.mockRejectedValue(firebaseError("auth/id-token-expired"));

      expect(await service.create("id-token")).toEqual({
        ok: false,
        error: { code: "invalid-credential" },
      });
    });

    it("maps unexpected failures to unknown", async () => {
      adminAuth.verifyIdToken.mockRejectedValue(new Error("boom"));

      expect(await service.create("id-token")).toEqual({ ok: false, error: { code: "unknown" } });
    });
  });

  describe("refresh", () => {
    it("re-mints the cookie for the same user without the recent sign-in rule", async () => {
      adminAuth.verifySessionCookie.mockResolvedValue({ uid: "u1" });
      adminAuth.verifyIdToken.mockResolvedValue({ uid: "u1", auth_time: nowSeconds() - 3600 });
      adminAuth.createSessionCookie.mockResolvedValue("cookie-2");

      const result = await service.refresh("fresh-token", "old-cookie");

      expect(adminAuth.verifySessionCookie).toHaveBeenCalledWith("old-cookie", true);
      expect(result.ok && result.value.value).toBe("cookie-2");
    });

    it("refuses a credential that belongs to a different user", async () => {
      adminAuth.verifySessionCookie.mockResolvedValue({ uid: "u1" });
      adminAuth.verifyIdToken.mockResolvedValue({ uid: "u2", auth_time: nowSeconds() });

      expect(await service.refresh("token-of-u2", "cookie-of-u1")).toEqual({
        ok: false,
        error: { code: "invalid-credential" },
      });
      expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
    });

    it("treats an invalid current cookie as unauthenticated", async () => {
      adminAuth.verifySessionCookie.mockRejectedValue(firebaseError("auth/session-cookie-expired"));

      expect(await service.refresh("token", "stale")).toEqual({ ok: false, error: { code: "unauthenticated" } });
      expect(adminAuth.createSessionCookie).not.toHaveBeenCalled();
    });
  });

  describe("verify", () => {
    it("builds the session from the verified cookie claims", async () => {
      adminAuth.verifySessionCookie.mockResolvedValue({
        uid: "u1",
        role: "staff",
        name: "Ada",
        picture: "https://example.test/ada.png",
      });

      const result = await service.verify("cookie");

      expect(adminAuth.verifySessionCookie).toHaveBeenCalledWith("cookie", true);
      expect(result).toEqual({
        ok: true,
        value: { uid: "u1", role: "staff", displayName: "Ada", photoUrl: "https://example.test/ada.png", verifiedEmail: null },
      });
    });

    it("keeps the email only when the provider verified it, lowercased", async () => {
      adminAuth.verifySessionCookie.mockResolvedValue({ uid: "u1", email: "Ada@Example.com", email_verified: true });
      expect(await service.verify("cookie")).toMatchObject({ ok: true, value: { verifiedEmail: "ada@example.com" } });

      adminAuth.verifySessionCookie.mockResolvedValue({ uid: "u1", email: "ada@example.com", email_verified: false });
      expect(await service.verify("cookie")).toMatchObject({ ok: true, value: { verifiedEmail: null } });
    });

    it("has no role until the server sets the claim, and ignores unknown roles", async () => {
      adminAuth.verifySessionCookie.mockResolvedValueOnce({ uid: "u1" });
      adminAuth.verifySessionCookie.mockResolvedValueOnce({ uid: "u2", role: "superuser" });

      const first = await service.verify("a");
      const second = await service.verify("b");

      expect(first.ok && first.value.role).toBeNull();
      expect(second.ok && second.value.role).toBeNull();
    });

    it("treats a revoked or malformed cookie as unauthenticated", async () => {
      adminAuth.verifySessionCookie.mockRejectedValue(firebaseError("auth/session-cookie-revoked"));

      expect(await service.verify("cookie")).toEqual({
        ok: false,
        error: { code: "unauthenticated" },
      });
    });
  });

  describe("revoke", () => {
    it("revokes the refresh tokens of the user", async () => {
      adminAuth.revokeRefreshTokens.mockResolvedValue(undefined);

      expect(await service.revoke("u1")).toEqual({ ok: true, value: undefined });
      expect(adminAuth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
    });

    it("reports a failed revocation", async () => {
      adminAuth.revokeRefreshTokens.mockRejectedValue(new Error("boom"));

      expect(await service.revoke("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    });
  });
});
