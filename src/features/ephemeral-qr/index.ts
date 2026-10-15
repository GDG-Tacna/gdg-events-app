// Public API (client-safe). Server-only exports live in `./server`.
export { QR_LIFETIME_SECONDS } from "./domain/qr-code";
export type { EphemeralQrError, EphemeralQrErrorCode } from "./domain/qr-error";
export type { IssueQrAction, IssueQrActionResult, QrView } from "./ui/action";
export { QrCodeSvg, type QrCodeSvgProps } from "./ui/QrCodeSvg";
export { QrDisplay, formatCountdown, type QrDisplayProps } from "./ui/QrDisplay";
export { useRenewingCode, type RenewingState, type TimedCode } from "./ui/use-renewing-code";
