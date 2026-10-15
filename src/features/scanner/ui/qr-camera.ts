import type { ComponentType } from "react";
import type { CameraErrorCode } from "../domain/camera";

export interface QrCameraProps {
  /** While true the camera keeps its (frozen) picture but reports nothing, so a code being sent is not read twice. */
  paused: boolean;
  /** The text of a QR code it read. A code still in front of the lens is not reported again. */
  onDetect: (text: string) => void;
  /** The camera could not start (or stopped working). */
  onError: (code: CameraErrorCode) => void;
  /** Accessible name of the live picture. */
  label: string;
}

/**
 * The camera that reads QR codes, as a component: it owns the device camera while mounted and always releases it
 * when unmounted. Screens receive it as a prop (the app shell binds the real one; tests use a fake), so they never
 * touch the camera library.
 */
export type QrCamera = ComponentType<QrCameraProps>;
