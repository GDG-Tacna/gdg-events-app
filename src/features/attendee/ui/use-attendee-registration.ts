"use client";

import { useCallback, useState } from "react";
import { useAuthActions } from "@/features/auth";
import type { AliasErrorCode } from "../domain/alias";
import type { AttendeeErrorCode } from "../domain/attendee-error";
import type { RegisterAttendeeAction } from "./registration";

export type RegistrationStatus = "idle" | "pending" | "success" | "error";

export interface RegistrationState {
  status: RegistrationStatus;
  errorCode: AttendeeErrorCode | null;
  /** Which alias rule failed, when `errorCode` is `alias-invalid`. */
  aliasError: AliasErrorCode | null;
}

const IDLE: RegistrationState = { status: "idle", errorCode: null, aliasError: null };

/**
 * Registers the attendee through the injected server action, then swaps the session cookie so the
 * new `attendee` role takes effect. `submit()` resolves true only when both steps worked.
 */
export function useAttendeeRegistration(register: RegisterAttendeeAction) {
  const { refreshSession } = useAuthActions();
  const [state, setState] = useState<RegistrationState>(IDLE);

  const submit = useCallback(
    async (alias: string) => {
      setState({ status: "pending", errorCode: null, aliasError: null });

      const registered = await register({ alias });
      if (!registered.ok) {
        setState({ status: "error", errorCode: registered.code, aliasError: registered.alias ?? null });
        return false;
      }

      const refreshed = await refreshSession();
      if (!refreshed.ok) {
        // The profile exists; only the cookie swap failed. Retrying is safe (registration is idempotent).
        setState({ status: "error", errorCode: "unknown", aliasError: null });
        return false;
      }

      setState({ status: "success", errorCode: null, aliasError: null });
      return true;
    },
    [register, refreshSession],
  );

  return { ...state, submit };
}
