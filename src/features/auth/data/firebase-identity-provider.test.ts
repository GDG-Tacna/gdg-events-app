import { FirebaseError } from "firebase/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInWithPopup: vi.fn(), signOut: vi.fn(), getFirebaseAuth: vi.fn(() => ({})) }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
}));
vi.mock("@/shared/lib/firebase/client", () => ({ getFirebaseAuth: mocks.getFirebaseAuth }));

const { FirebaseIdentityProvider } = await import("./firebase-identity-provider");

describe("FirebaseIdentityProvider.signInWithGoogle", () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirebaseAuth.mockImplementation(() => ({}));
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("hands back the ID token of the signed-in user", async () => {
    mocks.signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => "id-token" } });

    expect(await new FirebaseIdentityProvider().signInWithGoogle()).toEqual({ ok: true, value: { kind: "credential", credential: "id-token" } });
    expect(logged).not.toHaveBeenCalled();
  });

  it("maps a closed popup and a dropped network quietly", async () => {
    mocks.signInWithPopup.mockRejectedValueOnce(new FirebaseError("auth/popup-closed-by-user", "closed"));
    expect(await new FirebaseIdentityProvider().signInWithGoogle()).toMatchObject({ ok: false, error: { code: "cancelled" } });
    mocks.signInWithPopup.mockRejectedValueOnce(new FirebaseError("auth/network-request-failed", "offline"));
    expect(await new FirebaseIdentityProvider().signInWithGoogle()).toMatchObject({ ok: false, error: { code: "network" } });
    expect(logged).not.toHaveBeenCalled();
  });

  it("reports an unexpected Firebase failure to the console with its code", async () => {
    mocks.signInWithPopup.mockRejectedValue(new FirebaseError("auth/unauthorized-domain", "domain not allowed\nmore"));

    expect(await new FirebaseIdentityProvider().signInWithGoogle()).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toEqual({ type: "client_error", scope: "auth.signIn", code: "auth/unauthorized-domain", message: "domain not allowed" });
  });

  it("reports a broken web config (the client cannot even start) to the console", async () => {
    mocks.getFirebaseAuth.mockImplementation(() => {
      throw new Error("Invalid string: must match pattern");
    });

    expect(await new FirebaseIdentityProvider().signInWithGoogle()).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({ scope: "auth.signIn", message: "Invalid string: must match pattern" });
  });
});

describe("FirebaseIdentityProvider.signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirebaseAuth.mockImplementation(() => ({}));
  });

  it("signs the browser out of Firebase", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    await new FirebaseIdentityProvider().signOut();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("never throws, so signing out always finishes, and reports the failure to the console", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getFirebaseAuth.mockImplementation(() => {
      throw new Error("Invalid string: must match pattern");
    });

    await expect(new FirebaseIdentityProvider().signOut()).resolves.toBeUndefined();
    expect(JSON.parse(String(logged.mock.calls[0][0]))).toMatchObject({ scope: "auth.signOut", message: "Invalid string: must match pattern" });

    mocks.getFirebaseAuth.mockImplementation(() => ({}));
    mocks.signOut.mockRejectedValue(new FirebaseError("auth/network-request-failed", "offline"));
    await expect(new FirebaseIdentityProvider().signOut()).resolves.toBeUndefined();
  });
});

describe("FirebaseIdentityProvider.refreshCredential", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits for the restored user before asking for a fresh token (a new role reaches the session)", async () => {
    const auth: { currentUser: { getIdToken: (force: boolean) => Promise<string> } | null; authStateReady: () => Promise<void> } = {
      currentUser: null,
      // The user shows up only once the restored state is ready, as after a page load.
      authStateReady: vi.fn(async () => {
        auth.currentUser = { getIdToken: vi.fn(async (force: boolean) => (force ? "fresh-token" : "old-token")) };
      }),
    };
    mocks.getFirebaseAuth.mockImplementation(() => auth);

    expect(await new FirebaseIdentityProvider().refreshCredential()).toEqual({ ok: true, value: "fresh-token" });
    expect(auth.authStateReady).toHaveBeenCalled();
  });

  it("answers unauthenticated when nobody is signed in on this browser", async () => {
    mocks.getFirebaseAuth.mockImplementation(() => ({ currentUser: null, authStateReady: async () => undefined }));

    expect(await new FirebaseIdentityProvider().refreshCredential()).toEqual({ ok: false, error: expect.objectContaining({ code: "unauthenticated" }) });
  });
});
