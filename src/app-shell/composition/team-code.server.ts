import "server-only";
import { QrCodeEncoder } from "@/features/ephemeral-qr/server";
import type { TeamCodeDeps } from "@/features/team-code/server";
import { qrSigner } from "./qr-signer.server";

/**
 * Composition root for team members' codes: signed with the secret the other QR codes use (each kind signs its own
 * prefix) and drawn by the same encoder. Nothing is stored.
 */
export const teamCodeDeps: TeamCodeDeps = {
  signer: qrSigner,
  encoder: new QrCodeEncoder(),
  now: Date.now,
};
