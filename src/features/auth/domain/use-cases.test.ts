import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { authError } from "./auth-error";
import type { AuthSession } from "./auth-session";
import type { IdentityProvider, SessionGateway, SessionService } from "./ports";
import {
  closeSession,
  completeSignIn,
  openSession,
  readSession,
  refreshSession,
  refreshSessionCookie,
  signInWithGoogle,
  signOut,
} from "./use-cases";

const session: AuthSession = { uid: "u1", role: "attendee", displayName: "Ada", photoUrl: null };

function fakeIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    signInWithGoogle: vi.fn(async () => ok({ kind: "credential" as const, credential: "cred-1" })),
    resumeSignIn: vi.fn(async () => ok(null)),
    refreshCredential: vi.fn(async () => ok("cred-fresh")),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

function fakeGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    open: vi.fn(async () => ok(undefined)),
    refresh: vi.fn(async () => ok(undefined)),
    close: vi.fn(async () => ok(undefined)),
    ...overrides,
  };
}

function fakeSessions(overrides: Partial<SessionService> = {}): SessionService {
  return {
    create: vi.fn(async () => ok({ value: "cookie", expiresAt: new Date(0) })),
    refresh: vi.fn(async () => ok({ value: "cookie-2", expiresAt: new Date(0) })),
    verify: vi.fn(async () => ok(session)),
    revoke: vi.fn(async () => ok(undefined)),
    ...overrides,
  };
}

describe("signInWithGoogle", () => {
  it("opens the server session with the credential and reports signed-in", async () => {
    const identity = fakeIdentity();
    const gateway = fakeGateway();

    const result = await signInWithGoogle({ identity, gateway });

    expect(result).toEqual(ok("signed-in"));
    expect(gateway.open).toHaveBeenCalledWith("cred-1");
  });

  it("returns the identity error without touching the server", async () => {
    const identity = fakeIdentity({
      signInWithGoogle: vi.fn(async () => err(authError("cancelled"))),
    });
    const gateway = fakeGateway();

    const result = await signInWithGoogle({ identity, gateway });

    expect(result).toEqual(err(authError("cancelled")));
    expect(gateway.open).not.toHaveBeenCalled();
  });

  it("signs the client out when the server refuses the credential", async () => {
    const identity = fakeIdentity();
    const gateway = fakeGateway({ open: vi.fn(async () => err(authError("invalid-credential"))) });

    const result = await signInWithGoogle({ identity, gateway });

    expect(result).toEqual(err(authError("invalid-credential")));
    expect(identity.signOut).toHaveBeenCalledOnce();
  });

  it("waits for the redirect without opening a session", async () => {
    const identity = fakeIdentity({
      signInWithGoogle: vi.fn(async () => ok({ kind: "redirecting" as const })),
    });
    const gateway = fakeGateway();

    const result = await signInWithGoogle({ identity, gateway });

    expect(result).toEqual(ok("redirecting"));
    expect(gateway.open).not.toHaveBeenCalled();
  });
});

describe("completeSignIn", () => {
  it("resolves false when no sign-in was pending", async () => {
    const gateway = fakeGateway();

    expect(await completeSignIn({ identity: fakeIdentity(), gateway })).toEqual(ok(false));
    expect(gateway.open).not.toHaveBeenCalled();
  });

  it("opens the session for a pending redirect sign-in", async () => {
    const identity = fakeIdentity({ resumeSignIn: vi.fn(async () => ok("cred-2")) });
    const gateway = fakeGateway();

    expect(await completeSignIn({ identity, gateway })).toEqual(ok(true));
    expect(gateway.open).toHaveBeenCalledWith("cred-2");
  });

  it("signs the client out when the server refuses the resumed credential", async () => {
    const identity = fakeIdentity({ resumeSignIn: vi.fn(async () => ok("cred-2")) });
    const gateway = fakeGateway({ open: vi.fn(async () => err(authError("network"))) });

    expect(await completeSignIn({ identity, gateway })).toEqual(err(authError("network")));
    expect(identity.signOut).toHaveBeenCalledOnce();
  });
});

describe("refreshSession", () => {
  it("swaps the cookie using a freshly issued credential", async () => {
    const identity = fakeIdentity();
    const gateway = fakeGateway();

    expect(await refreshSession({ identity, gateway })).toEqual(ok(undefined));
    expect(gateway.refresh).toHaveBeenCalledWith("cred-fresh");
  });

  it("does not touch the server when no fresh credential can be issued", async () => {
    const identity = fakeIdentity({ refreshCredential: vi.fn(async () => err(authError("unauthenticated"))) });
    const gateway = fakeGateway();

    expect(await refreshSession({ identity, gateway })).toEqual(err(authError("unauthenticated")));
    expect(gateway.refresh).not.toHaveBeenCalled();
  });

  it("reports a server refusal without signing the user out", async () => {
    const identity = fakeIdentity();
    const gateway = fakeGateway({ refresh: vi.fn(async () => err(authError("network"))) });

    expect(await refreshSession({ identity, gateway })).toEqual(err(authError("network")));
    expect(identity.signOut).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("closes the server session, then the client identity", async () => {
    const calls: string[] = [];
    const identity = fakeIdentity({ signOut: vi.fn(async () => void calls.push("identity")) });
    const gateway = fakeGateway({
      close: vi.fn(async () => {
        calls.push("gateway");
        return ok(undefined);
      }),
    });

    expect(await signOut({ identity, gateway })).toEqual(ok(undefined));
    expect(calls).toEqual(["gateway", "identity"]);
  });

  it("still drops the client identity when the server could not close the session", async () => {
    const identity = fakeIdentity();
    const gateway = fakeGateway({ close: vi.fn(async () => err(authError("network"))) });

    expect(await signOut({ identity, gateway })).toEqual(err(authError("network")));
    expect(identity.signOut).toHaveBeenCalledOnce();
  });
});

describe("openSession", () => {
  it.each(["", "   "])("rejects the blank credential %j without calling the service", async (credential) => {
    const sessions = fakeSessions();

    expect(await openSession({ sessions }, credential)).toEqual(err(authError("invalid-credential")));
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("delegates a real credential to the session service", async () => {
    const sessions = fakeSessions();

    const result = await openSession({ sessions }, "cred-1");

    expect(result.ok).toBe(true);
    expect(sessions.create).toHaveBeenCalledWith("cred-1");
  });
});

describe("refreshSessionCookie", () => {
  it("needs the current cookie", async () => {
    const sessions = fakeSessions();

    expect(await refreshSessionCookie({ sessions }, "cred", undefined)).toEqual(err(authError("unauthenticated")));
    expect(sessions.refresh).not.toHaveBeenCalled();
  });

  it("rejects a blank credential", async () => {
    const sessions = fakeSessions();

    expect(await refreshSessionCookie({ sessions }, " ", "cookie")).toEqual(err(authError("invalid-credential")));
    expect(sessions.refresh).not.toHaveBeenCalled();
  });

  it("delegates both proofs to the session service", async () => {
    const sessions = fakeSessions();

    const result = await refreshSessionCookie({ sessions }, "cred", "cookie");

    expect(result.ok).toBe(true);
    expect(sessions.refresh).toHaveBeenCalledWith("cred", "cookie");
  });
});

describe("readSession", () => {
  it("is unauthenticated without a cookie", async () => {
    const sessions = fakeSessions();

    expect(await readSession({ sessions }, undefined)).toEqual(err(authError("unauthenticated")));
    expect(sessions.verify).not.toHaveBeenCalled();
  });

  it("returns the verified session", async () => {
    expect(await readSession({ sessions: fakeSessions() }, "cookie")).toEqual(ok(session));
  });
});

describe("closeSession", () => {
  it("revokes the sessions of the user behind the cookie", async () => {
    const sessions = fakeSessions();

    expect(await closeSession({ sessions }, "cookie")).toEqual(ok(undefined));
    expect(sessions.revoke).toHaveBeenCalledWith("u1");
  });

  it("succeeds without revoking when the cookie is already invalid", async () => {
    const sessions = fakeSessions({ verify: vi.fn(async () => err(authError("unauthenticated"))) });

    expect(await closeSession({ sessions }, "stale")).toEqual(ok(undefined));
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
