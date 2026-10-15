"use client";

import { useCallback, useState } from "react";
import type { Result } from "@/shared/lib/result";
import type { AuthError, AuthErrorCode } from "../domain/auth-error";
import { useAuthActions, type AuthActions } from "./auth-context";

export type AuthFlowStatus = "idle" | "pending" | "success" | "error";

export interface AuthFlowState {
  status: AuthFlowStatus;
  errorCode: AuthErrorCode | null;
}

const IDLE: AuthFlowState = { status: "idle", errorCode: null };

function useAuthFlow(select: (actions: AuthActions) => () => Promise<Result<unknown, AuthError>>) {
  const actions = useAuthActions();
  const [state, setState] = useState<AuthFlowState>(IDLE);

  const run = useCallback(async () => {
    setState({ status: "pending", errorCode: null });
    const result = await select(actions)();
    if (result.ok) {
      if (result.value === "redirecting") {
        // The browser is leaving the page: keep showing progress and let the caller wait.
        setState({ status: "pending", errorCode: null });
        return false;
      }
      setState({ status: "success", errorCode: null });
      return true;
    }
    // A closed popup is a user choice, not an error to show.
    setState(result.error.code === "cancelled" ? IDLE : { status: "error", errorCode: result.error.code });
    return false;
  }, [actions, select]);

  return { ...state, run };
}

const selectSignIn = (actions: AuthActions) => actions.signInWithGoogle;
const selectSignOut = (actions: AuthActions) => actions.signOut;

/** Connects the sign-in button to the use case. `run()` resolves true only when finished, so the caller can navigate. */
export function useGoogleSignIn() {
  return useAuthFlow(selectSignIn);
}

export function useSignOut() {
  return useAuthFlow(selectSignOut);
}
