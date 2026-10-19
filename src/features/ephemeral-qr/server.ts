import "server-only";

// Public API (server-only). Client code must import from "@/features/ephemeral-qr" instead.
export type { QrEncoder, TalkLookup, TokenSigner } from "./domain/ports";
export {
  issueQr,
  listTalks,
  verifyPayload,
  type EphemeralQrDeps,
  type IssuedQr,
  type QrActor,
  type TalkOption,
} from "./domain/use-cases";
export { EphemeralQrPayloadVerifier } from "./data/ephemeral-qr-payload-verifier";
export { HmacTokenSigner, MIN_SECRET_LENGTH } from "./data/hmac-token-signer";
export { QrCodeEncoder } from "./data/qrcode-encoder";
