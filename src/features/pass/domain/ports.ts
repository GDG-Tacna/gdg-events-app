/** Signs and checks short messages with a server secret (the same signer the talk codes use). */
export interface TokenSigner {
  sign(input: string): string;
  /** Constant-time comparison: a wrong guess reveals nothing about the right one. */
  verify(input: string, signature: string): boolean;
}

/** Draws a QR code. Rows of "1" (dark) and "0" (light), without the quiet zone. */
export interface QrEncoder {
  encode(text: string): readonly string[];
}
