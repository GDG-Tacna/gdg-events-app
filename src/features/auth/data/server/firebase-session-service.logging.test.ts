import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("server-only", () => ({}));

const adminAuth = {
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminAuth: () => adminAuth }));

const { FirebaseSessionService } = await import("./firebase-session-service");

const firebaseError = (code: string, message = code) => Object.assign(new Error(message), { code });
const loggedLines = (spy: MockInstance<typeof console.error>) => spy.mock.calls.map((call) => JSON.parse(call[0] as string));

describe("FirebaseSessionService logging", () => {
  const service = new FirebaseSessionService();
  let spy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.resetAllMocks();
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("logs missing Admin credentials, the failure behind a 500 on sign-in", async () => {
    adminAuth.verifyIdToken.mockResolvedValue({ uid: "u1", auth_time: Math.floor(Date.now() / 1000) });
    adminAuth.createSessionCookie.mockRejectedValue(
      firebaseError("app/invalid-credential", "Credential implementation failed to fetch a valid Google OAuth2 access token"),
    );

    const result = await service.create("id-token-secret-value");

    expect(result).toEqual({ ok: false, error: { code: "unknown" } });
    expect(loggedLines(spy)).toEqual([
      expect.objectContaining({ scope: "auth.session.create", code: "app/invalid-credential" }),
    ]);
  });

  it("never prints the credential it was given", async () => {
    adminAuth.verifyIdToken.mockRejectedValue(new Error("boom"));

    await service.create("id-token-secret-value");

    expect(JSON.stringify(spy.mock.calls)).not.toContain("id-token-secret-value");
  });

  it.each(["auth/id-token-expired", "auth/argument-error", "auth/session-cookie-revoked"])(
    "does not log the expected failure %s",
    async (code) => {
      adminAuth.verifyIdToken.mockRejectedValue(firebaseError(code));
      adminAuth.verifySessionCookie.mockRejectedValue(firebaseError(code));

      await service.create("token");
      await service.verify("cookie");

      expect(spy).not.toHaveBeenCalled();
    },
  );

  it("logs when verifying a cookie fails for a server reason, instead of silently signing the user out", async () => {
    adminAuth.verifySessionCookie.mockRejectedValue(firebaseError("app/invalid-credential"));

    expect(await service.verify("cookie")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(loggedLines(spy)[0]).toMatchObject({ scope: "auth.session.verify" });
  });

  it("names the scope of each operation", async () => {
    adminAuth.verifySessionCookie.mockRejectedValue(new Error("x"));
    adminAuth.revokeRefreshTokens.mockRejectedValue(new Error("x"));

    await service.refresh("t", "c");
    await service.revoke("u1");

    expect(loggedLines(spy).map((line) => line.scope)).toEqual(["auth.session.refresh", "auth.session.revoke"]);
  });
});
