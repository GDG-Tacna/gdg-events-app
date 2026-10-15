import { ok, type Result } from "@/shared/lib/result";
import type { GateVerdict, ServeGate } from "../domain/ports";

/** Every registered attendee may receive the meal: a gate for tests and for an edition without food gates. */
export class AllowAllServeGate implements ServeGate {
  async check(): Promise<Result<GateVerdict, { code: string }>> {
    return ok({ allowed: true });
  }
}
