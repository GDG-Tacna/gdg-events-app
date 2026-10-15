import "server-only";
import { HmacTokenSigner } from "@/features/ephemeral-qr/server";
import { getServerEnv } from "@/shared/config/env.server";

/**
 * The one signer of ephemeral QR codes. Issuing (admin) and checking (scan) must share the same secret,
 * so both compositions import this instead of building their own. The secret is read when used.
 */
export const qrSigner = new HmacTokenSigner(() => getServerEnv().qrSigningSecret);
