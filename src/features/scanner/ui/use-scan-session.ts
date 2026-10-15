"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraErrorCode } from "../domain/camera";

/** The states of one scanning session, for whatever the server answers (`T`). */
export type ScanSessionState<T> =
  | { status: "scanning" }
  | { status: "sending" }
  | { status: "done"; result: T }
  | { status: "camera-error"; code: CameraErrorCode };

/**
 * Runs scanning sessions: sends the first code the camera reads through `submit` and shows what came back. While
 * a code is being sent, and while its answer is on screen, the camera is paused, so a code held in front of the lens
 * is never sent twice. After a camera problem, `start` mounts a fresh camera (`camera.key` changes).
 *
 * `submit` and `failure` must keep the same identity between renders (wrap them in `useCallback` or define them
 * outside the component).
 */
export function useScanSession<T>(submit: (text: string) => Promise<T>, failure: T) {
  const [state, setState] = useState<ScanSessionState<T>>({ status: "scanning" });
  const [attempt, setAttempt] = useState(0);
  const status = useRef<ScanSessionState<T>["status"]>("scanning");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const update = useCallback((next: ScanSessionState<T>) => {
    status.current = next.status;
    setState(next);
  }, []);

  const onDetect = useCallback(
    async (text: string) => {
      // Only one code at a time, and only while looking.
      if (status.current !== "scanning") return;
      update({ status: "sending" });

      let result: T;
      try {
        result = await submit(text);
      } catch {
        result = failure;
      }
      if (!alive.current) return;
      update({ status: "done", result });
    },
    [submit, failure, update],
  );

  const onError = useCallback(
    (code: CameraErrorCode) => {
      if (alive.current) update({ status: "camera-error", code });
    },
    [update],
  );

  /** After a camera problem: try a fresh camera. */
  const start = useCallback(() => {
    if (status.current !== "camera-error") return;
    setAttempt((current) => current + 1);
    update({ status: "scanning" });
  }, [update]);

  /** After a result: look for the next code. */
  const scanAgain = useCallback(() => {
    if (status.current === "done") update({ status: "scanning" });
  }, [update]);

  return {
    state,
    /** Spread onto the camera. Absent while the camera failed: there is nothing to show. */
    camera: state.status === "camera-error" ? null : { paused: state.status !== "scanning", onDetect: (text: string) => void onDetect(text), onError },
    /** The camera's React key: it changes after a problem, so `start` mounts a fresh camera. */
    cameraKey: attempt,
    start,
    scanAgain,
  };
}
