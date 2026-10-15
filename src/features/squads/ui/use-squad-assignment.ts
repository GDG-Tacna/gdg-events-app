"use client";

import { useCallback, useState } from "react";
import type { SquadId } from "@/shared/types/squad";
import type { SquadErrorCode } from "../domain/squad-error";
import type { AssignSquadAction } from "./assignment";

export type SquadAssignmentStatus = "idle" | "pending" | "revealed" | "error";

export interface SquadAssignmentState {
  status: SquadAssignmentStatus;
  squad: SquadId | null;
  errorCode: SquadErrorCode | null;
}

/**
 * Drives the reveal screen. `initialSquad` is the squad the attendee already has (the screen then
 * opens revealed); otherwise `assign()` asks the server for one. Calling it again is safe.
 */
export function useSquadAssignment(assignAction: AssignSquadAction, initialSquad: SquadId | null = null) {
  const [state, setState] = useState<SquadAssignmentState>(
    initialSquad
      ? { status: "revealed", squad: initialSquad, errorCode: null }
      : { status: "idle", squad: null, errorCode: null },
  );

  const assign = useCallback(async () => {
    setState({ status: "pending", squad: null, errorCode: null });
    const result = await assignAction();
    if (!result.ok) {
      setState({ status: "error", squad: null, errorCode: result.code });
      return false;
    }
    setState({ status: "revealed", squad: result.squad, errorCode: null });
    return true;
  }, [assignAction]);

  return { ...state, assign };
}
