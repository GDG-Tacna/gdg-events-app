import type { Result } from "@/shared/lib/result";
import type { EphemeralQrError } from "./qr-error";

/** Signs and checks short messages with a server secret. */
export interface TokenSigner {
  sign(input: string): string;
  /** Constant-time comparison: a wrong guess reveals nothing about the right one. */
  verify(input: string, signature: string): boolean;
}

/** Draws a QR code. Rows of "1" (dark) and "0" (light), without the quiet zone. */
export interface QrEncoder {
  encode(text: string): readonly string[];
}

/** The slice of the checkpoint catalog this feature needs; the check-ins catalog satisfies it. */
export interface TalkLookup {
  find(id: string): Promise<Result<LookedUpCheckpoint | null, { code: string }>>;
  listActive(): Promise<Result<readonly LookedUpCheckpoint[], { code: string }>>;
}

/** A checkpoint as this feature reads it; a puesto may also have a description and an image address. */
export interface LookedUpCheckpoint {
  id: string;
  kind: string;
  name: string;
  active: boolean;
  description?: string;
  image?: string | null;
}

export type { EphemeralQrError };
