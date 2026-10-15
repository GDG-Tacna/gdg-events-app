import "server-only";
import { qrSigner } from "@/app-shell/composition/qr-signer.server";
import { QrCodeEncoder } from "@/features/ephemeral-qr/server";
import type { PassDeps } from "@/features/pass/server";

/**
 * Composition root for attendee passes. They are signed with the same server secret as the talk codes
 * (a different signed text keeps the two from ever being interchangeable) and drawn with the same encoder.
 */
export const passDeps: PassDeps = {
  signer: qrSigner,
  encoder: new QrCodeEncoder(),
  now: Date.now,
};
