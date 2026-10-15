"use client";

import { Scanner, setZXingModuleOverrides, type IDetectedBarcode, type IScannerError, type IScannerProps, type ScannerErrorKind } from "@yudiel/react-qr-scanner";
import type { CameraErrorCode } from "../domain/camera";
import type { QrCameraProps } from "../ui/qr-camera";

/**
 * Where the QR decoder (ZXing compiled to WebAssembly) is served from: the app itself, not a CDN, so scanning works
 * on the venue's network and nothing is fetched from a third party. Browsers with a native detector (Chrome on
 * Android) never load it; Safari on iPhone does. `npm run zxing:copy` refreshes the file after an upgrade.
 */
export const ZXING_BASE = "/zxing/";

setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `${ZXING_BASE}${path}` : `${prefix}${path}`),
});

/**
 * The library's error kinds as the screens know them. `null`: not a problem to show (the camera was stopped on
 * purpose when the screen went away).
 */
export function cameraErrorCodeOf(kind: ScannerErrorKind): CameraErrorCode | null {
  switch (kind) {
    case "permission-denied":
    case "security":
      return "denied";
    case "no-camera":
    case "overconstrained":
      return "no-camera";
    case "insecure-context":
    case "unsupported":
      return "unsupported";
    case "aborted":
      return null;
    default:
      return "failed";
  }
}

/**
 * The rear camera at a sharp size when it has one, without minimums: the library's defaults ask for at least 640 px
 * of height, which a 480p laptop webcam (a staff desk) cannot give, so the camera would not start at all. A
 * constant, so the library never sees new constraints and restarts the camera.
 */
export const CAMERA_CONSTRAINTS: MediaTrackConstraints = { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } };

const NO_CONTROLS = { finder: false, torch: false, onOff: false, zoom: false } as const;
const FILL = { container: { width: "100%", height: "100%" }, video: { width: "100%", height: "100%", objectFit: "cover" } } as const;
const QR_ONLY: NonNullable<IScannerProps["formats"]> = ["qr_code"];

/** The first QR text among the detected codes, or `null`. */
export const firstText = (codes: readonly IDetectedBarcode[]): string | null => codes.find((code) => code.rawValue.length > 0)?.rawValue ?? null;

/**
 * The camera adapter over `@yudiel/react-qr-scanner`: the rear camera, QR codes only, no sound and none of the
 * library's own controls (the screens draw the reticle). The same code is reported once while it stays in view.
 */
export default function YudielQrCamera({ paused, onDetect, onError, label }: QrCameraProps) {
  return (
    <div role="img" aria-label={label} className="size-full">
      <Scanner
        onScan={(codes) => {
          const text = firstText(codes);
          if (text !== null) onDetect(text);
        }}
        onError={(error: IScannerError) => {
          const code = cameraErrorCodeOf(error.kind);
          if (code !== null) onError(code);
        }}
        paused={paused}
        formats={QR_ONLY}
        constraints={CAMERA_CONSTRAINTS}
        components={NO_CONTROLS}
        sound={false}
        styles={FILL}
      />
    </div>
  );
}
