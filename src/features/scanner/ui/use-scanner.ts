"use client";

import { useCallback } from "react";
import type { RecordCheckInAction } from "@/features/checkins";
import type { ScanOutcome, ScanState } from "../domain/scan-state";
import { useScanSession } from "./use-scan-session";

const FAILED: ScanOutcome = { ok: false, code: "unknown" };

/**
 * The attendee's scanning session: each code goes to the check-in action and the answer is shown as a
 * `ScanOutcome`. A server action that throws counts as an unknown failure instead of freezing the screen.
 */
export function useScanner(record: RecordCheckInAction) {
  const submit = useCallback(
    async (text: string): Promise<ScanOutcome> => {
      const result = await record(text);
      return result.ok
        ? { ok: true, kind: result.kind, recorded: result.recorded, firstEntrance: result.firstEntrance, missions: result.missions ?? [], talkCredits: result.talkCredits ?? 0, achievements: result.achievements ?? [] }
        : { ok: false, code: result.code };
    },
    [record],
  );
  const session = useScanSession(submit, FAILED);

  const state: ScanState = session.state.status === "done" ? { status: "done", outcome: session.state.result } : session.state;

  return { state, camera: session.camera, cameraKey: session.cameraKey, start: session.start, scanAgain: session.scanAgain };
}
