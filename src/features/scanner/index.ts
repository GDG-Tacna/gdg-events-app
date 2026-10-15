// Public API (client-safe).
export type { CameraError, CameraErrorCode } from "./domain/camera";
export type { ScanOutcome, ScanState } from "./domain/scan-state";
export { QrCodeCamera } from "./data/qr-code-camera";
export type { QrCamera, QrCameraProps } from "./ui/qr-camera";
export { ScanReticle, type ScanReticleProps } from "./ui/ScanReticle";
export { ScannerView, messageFor, type ScannerViewProps } from "./ui/ScannerView";
export { useScanSession, type ScanSessionState } from "./ui/use-scan-session";
