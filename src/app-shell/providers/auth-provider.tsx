"use client";

import { useMemo, type ReactNode } from "react";
import {
  AuthActionsProvider,
  FirebaseIdentityProvider,
  HttpSessionGateway,
  completeSignIn,
  refreshSession,
  signInWithGoogle,
  signOut,
  type AuthActions,
} from "@/features/auth";

/** Client composition root for auth: binds the Firebase and HTTP adapters to the use cases. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const actions = useMemo<AuthActions>(() => {
    const deps = { identity: new FirebaseIdentityProvider(), gateway: new HttpSessionGateway() };
    return {
      signInWithGoogle: () => signInWithGoogle(deps),
      completeSignIn: () => completeSignIn(deps),
      refreshSession: () => refreshSession(deps),
      signOut: () => signOut(deps),
    };
  }, []);

  return <AuthActionsProvider actions={actions}>{children}</AuthActionsProvider>;
}
