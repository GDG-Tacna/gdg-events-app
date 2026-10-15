import { err, ok, type Result } from "@/shared/lib/result";
import { authError, type AuthError } from "./auth-error";
import type { AuthSession } from "./auth-session";
import type {
  IdentityProvider,
  SessionCookie,
  SessionGateway,
  SessionService,
} from "./ports";

export type SignInStatus = "signed-in" | "redirecting";

interface ClientDeps {
  identity: IdentityProvider;
  gateway: SessionGateway;
}

async function openServerSession(
  deps: ClientDeps,
  credential: string,
): Promise<Result<void, AuthError>> {
  const opened = await deps.gateway.open(credential);
  if (!opened.ok) {
    // Do not leave a half-signed-in client behind when the server refuses.
    await deps.identity.signOut();
  }
  return opened;
}

/** Client: start Google sign-in; when it yields a credential, ask the server to open the session. */
export async function signInWithGoogle(deps: ClientDeps): Promise<Result<SignInStatus, AuthError>> {
  const started = await deps.identity.signInWithGoogle();
  if (!started.ok) return started;
  if (started.value.kind === "redirecting") return ok("redirecting");

  const opened = await openServerSession(deps, started.value.credential);
  return opened.ok ? ok("signed-in") : opened;
}

/** Client: finish a redirect-based sign-in. Resolves to false when none was pending. */
export async function completeSignIn(deps: ClientDeps): Promise<Result<boolean, AuthError>> {
  const resumed = await deps.identity.resumeSignIn();
  if (!resumed.ok) return resumed;
  if (resumed.value === null) return ok(false);

  const opened = await openServerSession(deps, resumed.value);
  return opened.ok ? ok(true) : opened;
}

/** Client: ask for a fresh credential and swap the session cookie, so a newly granted role takes effect. */
export async function refreshSession(deps: ClientDeps): Promise<Result<void, AuthError>> {
  const credential = await deps.identity.refreshCredential();
  if (!credential.ok) return credential;
  return deps.gateway.refresh(credential.value);
}

/** Client: close the server session first, then drop the client identity. */
export async function signOut(deps: ClientDeps): Promise<Result<void, AuthError>> {
  const closed = await deps.gateway.close();
  await deps.identity.signOut();
  return closed;
}

/** Server: exchange a freshly issued credential for a session cookie. */
export async function openSession(
  deps: { sessions: SessionService },
  credential: string,
): Promise<Result<SessionCookie, AuthError>> {
  if (credential.trim().length === 0) return err(authError("invalid-credential"));
  return deps.sessions.create(credential);
}

/** Server: replace the cookie of an already signed-in user (needs the current cookie and a fresh credential). */
export async function refreshSessionCookie(
  deps: { sessions: SessionService },
  credential: string,
  currentCookie: string | undefined,
): Promise<Result<SessionCookie, AuthError>> {
  if (!currentCookie) return err(authError("unauthenticated"));
  if (credential.trim().length === 0) return err(authError("invalid-credential"));
  return deps.sessions.refresh(credential, currentCookie);
}

/** Server: resolve the session behind a cookie value, if any. */
export async function readSession(
  deps: { sessions: SessionService },
  cookieValue: string | undefined,
): Promise<Result<AuthSession, AuthError>> {
  if (!cookieValue) return err(authError("unauthenticated"));
  return deps.sessions.verify(cookieValue);
}

/** Server: revoke every session of the user (used on sign-out). */
export async function closeSession(
  deps: { sessions: SessionService },
  cookieValue: string | undefined,
): Promise<Result<void, AuthError>> {
  const session = await readSession(deps, cookieValue);
  if (!session.ok) return ok(undefined); // already signed out: nothing to revoke
  return deps.sessions.revoke(session.value.uid);
}
