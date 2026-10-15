"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Result } from "@/shared/lib/result";
import type { AuthError } from "../domain/auth-error";
import type { SignInStatus } from "../domain/use-cases";

export interface AuthActions {
  signInWithGoogle(): Promise<Result<SignInStatus, AuthError>>;
  completeSignIn(): Promise<Result<boolean, AuthError>>;
  /** Swaps the session cookie for one that reflects the user's current role. */
  refreshSession(): Promise<Result<void, AuthError>>;
  signOut(): Promise<Result<void, AuthError>>;
}

const AuthActionsContext = createContext<AuthActions | null>(null);

export function AuthActionsProvider({
  actions,
  children,
}: {
  actions: AuthActions;
  children: ReactNode;
}) {
  return <AuthActionsContext.Provider value={actions}>{children}</AuthActionsContext.Provider>;
}

export function useAuthActions(): AuthActions {
  const actions = useContext(AuthActionsContext);
  if (!actions) throw new Error("useAuthActions must be used inside <AuthProvider>");
  return actions;
}
