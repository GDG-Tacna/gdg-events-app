import { err, ok, type Result } from "@/shared/lib/result";
import { verifyPass, type PassDeps } from "../domain/use-cases";

/** The scan-side check, shaped like the port the staff flow asks for (structurally, so the features stay independent). */
export class PassVerifier {
  constructor(private readonly deps: Pick<PassDeps, "signer" | "now">) {}

  async verify(payload: string): Promise<Result<{ uid: string }, { code: "invalid-code" | "expired-code" }>> {
    const outcome = verifyPass(this.deps, payload);
    return outcome.ok ? ok({ uid: outcome.uid }) : err({ code: outcome.code });
  }
}
