import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { TokenSigner } from "../domain/ports";

export const MIN_SECRET_LENGTH = 32;

/**
 * HMAC-SHA256 signer. The secret is read lazily on every use (so importing this file never needs
 * configuration) and must be long enough to resist guessing; a missing or short secret fails loudly
 * instead of signing with something weak.
 */
export class HmacTokenSigner implements TokenSigner {
  constructor(private readonly getSecret: () => string | undefined) {}

  sign(input: string): string {
    return createHmac("sha256", this.secret()).update(input).digest("base64url");
  }

  verify(input: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(input));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private secret(): string {
    const secret = this.getSecret();
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`QR_SIGNING_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters`);
    }
    return secret;
  }
}
