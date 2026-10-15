import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth } from "@/shared/lib/firebase/client";
import { err, ok, type Result } from "@/shared/lib/result";
import { authError, type AuthError } from "../domain/auth-error";
import type { IdentityProvider, SignInStart } from "../domain/ports";

function toAuthError(cause: unknown): AuthError {
  if (cause instanceof FirebaseError) {
    switch (cause.code) {
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return authError("cancelled");
      case "auth/network-request-failed":
        return authError("network");
    }
  }
  // Unexpected (an unauthorized domain, a blocked popup, a broken web config): the screen shows a generic message,
  // so the cause goes to the browser console. Only the code and the first line, never a token.
  const code = cause instanceof FirebaseError ? cause.code : undefined;
  const message = (cause instanceof Error ? cause.message : String(cause)).split("\n")[0].slice(0, 300);
  console.error(JSON.stringify({ type: "client_error", scope: "auth.signIn", code, message }));
  return authError("unknown");
}

/** Adapter over the Firebase client SDK; the domain never sees Firebase types. */
export class FirebaseIdentityProvider implements IdentityProvider {
  async signInWithGoogle(): Promise<Result<SignInStart, AuthError>> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(getFirebaseAuth(), provider);
      return ok({ kind: "credential", credential: await credential.user.getIdToken() });
    } catch (cause) {
      return err(toAuthError(cause));
    }
  }

  /** The popup flow completes inside `signInWithGoogle`, so nothing is ever pending. */
  async resumeSignIn(): Promise<Result<string | null, AuthError>> {
    return ok(null);
  }

  async refreshCredential(): Promise<Result<string, AuthError>> {
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return err(authError("unauthenticated"));
      return ok(await user.getIdToken(true));
    } catch (cause) {
      return err(toAuthError(cause));
    }
  }

  /**
   * Never throws: the server session is already closed when this runs, so a failure here (a broken web config, an
   * offline browser) must not leave the "Cerrar sesión" button waiting forever. It is reported to the console.
   */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch (cause) {
      const message = (cause instanceof Error ? cause.message : String(cause)).split("\n")[0].slice(0, 300);
      console.error(JSON.stringify({ type: "client_error", scope: "auth.signOut", code: cause instanceof FirebaseError ? cause.code : undefined, message }));
    }
  }
}
