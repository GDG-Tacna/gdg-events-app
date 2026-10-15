import "server-only";
import { checkInDeps } from "@/app-shell/composition/checkins.server";
import { qrSigner } from "@/app-shell/composition/qr-signer.server";
import { QrCodeEncoder, type EphemeralQrDeps } from "@/features/ephemeral-qr/server";

/**
 * Composition root for issuing ephemeral codes. The talks come from the check-ins catalog (structurally
 * compatible with what this feature asks for), so the two features never import each other's internals.
 */
export const ephemeralQrDeps: EphemeralQrDeps = {
  signer: qrSigner,
  encoder: new QrCodeEncoder(),
  lookup: checkInDeps.catalog,
  now: Date.now,
};
