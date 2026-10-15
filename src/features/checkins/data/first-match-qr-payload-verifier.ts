import { err, type Result } from "@/shared/lib/result";
import { checkInError, type CheckInError } from "../domain/checkin-error";
import type { QrPayloadVerifier, VerifiedScan } from "../domain/ports";

/**
 * Tries each verifier in turn and answers with the first one that accepts the code. When none does,
 * a code that was genuine but late (`expired-code`) is reported as such, so the scanner can tell the
 * attendee to scan the code that is on screen now; everything else is simply an invalid code.
 */
export class FirstMatchQrPayloadVerifier implements QrPayloadVerifier {
  constructor(private readonly verifiers: readonly QrPayloadVerifier[]) {}

  async verify(payload: string): Promise<Result<VerifiedScan, CheckInError>> {
    let expired = false;
    for (const verifier of this.verifiers) {
      const result = await verifier.verify(payload);
      if (result.ok) return result;
      if (result.error.code === "expired-code") expired = true;
    }
    return err(checkInError(expired ? "expired-code" : "invalid-code"));
  }
}
