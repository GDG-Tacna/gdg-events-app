import { act } from "@testing-library/react";
import { useEffect } from "react";
import type { CameraErrorCode, QrCamera, QrCameraProps } from "@/features/scanner";

/**
 * A stand-in for the device camera in tests: it renders a labelled box, remembers the props it was last given,
 * fails on mount when asked to (like a camera that cannot start), and lets the test "show" it a code.
 */
export function fakeQrCamera(failWith?: CameraErrorCode) {
  const record = { mounts: 0, unmounts: 0, props: null as QrCameraProps | null, failWith };

  const camera: QrCamera = function FakeQrCamera(props: QrCameraProps) {
    record.props = props;
    useEffect(() => {
      record.mounts += 1;
      if (record.failWith) props.onError(record.failWith);
      return () => {
        record.unmounts += 1;
      };
      // Mount and unmount only, like the real camera.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div role="img" aria-label={props.label} data-testid="qr-camera" data-paused={String(props.paused)} />;
  };

  return {
    camera,
    record,
    /** Holds a code in front of the camera: reported only while not paused, like the real one. */
    see: (text: string) =>
      act(async () => {
        if (record.props && !record.props.paused) record.props.onDetect(text);
      }),
    /** The camera stops working while on screen. */
    fail: (code: CameraErrorCode) =>
      act(async () => {
        record.props?.onError(code);
      }),
    /** Whether the camera on screen is paused right now. */
    paused: () => record.props?.paused ?? null,
  };
}
