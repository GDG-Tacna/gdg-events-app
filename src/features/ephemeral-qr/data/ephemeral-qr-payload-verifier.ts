import { err, ok, type Result } from "@/shared/lib/result";
import { verifyPayload, type EphemeralQrDeps } from "../domain/use-cases";

/** The scan-side check, shaped like the check-ins `QrPayloadVerifier` port (structurally, so the features stay independent). */
export class EphemeralQrPayloadVerifier {
  constructor(private readonly deps: Pick<EphemeralQrDeps, "signer" | "now">) {}

  async verify(
    payload: string,
  ): Promise<
    Result<{ checkpointId: string; source: "ephemeral" }, { code: "invalid-code" | "expired-code" }>
  > {
    const outcome = verifyPayload(this.deps, payload);
    return outcome.ok
      ? ok({ checkpointId: outcome.checkpointId, source: "ephemeral" })
      : err({ code: outcome.code });
  }
}
