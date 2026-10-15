export type CameraErrorCode =
  /** No camera API at all (very old browser, or a page that is not served over HTTPS). */
  | "unsupported"
  /** The person said no, or the browser or device blocks the camera for this site. */
  | "denied"
  | "no-camera"
  | "failed";

export interface CameraError {
  code: CameraErrorCode;
}

export const cameraError = (code: CameraErrorCode): CameraError => ({ code });
