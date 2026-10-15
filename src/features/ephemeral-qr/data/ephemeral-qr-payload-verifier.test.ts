import { describe, expect, it } from "vitest";
import { QR_LIFETIME_SECONDS, formatPayload, signingInput } from "../domain/qr-code";
import { EphemeralQrPayloadVerifier } from "./ephemeral-qr-payload-verifier";

const NOW = Date.UTC(2026, 9, 20, 14, 0, 0);
const signer = {
  sign: (input: string) => `sig_${input.replace(/[^A-Za-z0-9]/g, "-")}_xxxxxxxxxxxxxx`,
  verify(input: string, signature: string) {
    return signature === this.sign(input);
  },
};
const verifier = new EphemeralQrPayloadVerifier({ signer, now: () => NOW });
const payload = (expiresAt: number) => formatPayload("talk-1", expiresAt, signer.sign(signingInput("talk-1", expiresAt)));

describe("EphemeralQrPayloadVerifier", () => {
  it("accepts a live code and marks it as ephemeral, which is what lets a talk count", async () => {
    const result = await verifier.verify(payload(NOW / 1000 + QR_LIFETIME_SECONDS));

    expect(result).toEqual({ ok: true, value: { checkpointId: "talk-1", source: "ephemeral" } });
  });

  it("reports a late code as expired", async () => {
    expect(await verifier.verify(payload(NOW / 1000 - 1))).toEqual({ ok: false, error: { code: "expired-code" } });
  });

  it("reports anything else as invalid", async () => {
    expect(await verifier.verify("devfest:cp:talk-1")).toEqual({ ok: false, error: { code: "invalid-code" } });
    expect(await verifier.verify("devfest:eq:talk-1.99.forged-signature-value")).toEqual({
      ok: false,
      error: { code: "invalid-code" },
    });
  });
});
