import { describe, expect, it } from "vitest";
import { formatPassPayload, passSigningInput } from "../domain/pass-code";
import { PassVerifier } from "./pass-verifier";

const NOW = Date.UTC(2026, 9, 20, 14, 0, 0);
const UID = "kJ3x9QmZp0aBcD1eFgHiJkLmNoP2";
const signer = {
  sign: (input: string) => `sig_${input.replace(/[^A-Za-z0-9_-]/g, "-")}_xxxxxxxxxxxxxx`,
  verify(input: string, signature: string) {
    return signature === this.sign(input);
  },
};
const verifier = new PassVerifier({ signer, now: () => NOW });
const pass = (expiresAt: number) => formatPassPayload(UID, expiresAt, signer.sign(passSigningInput(UID, expiresAt)));

describe("PassVerifier", () => {
  it("accepts a live pass and says whose it is", async () => {
    expect(await verifier.verify(pass(NOW / 1000 + 30))).toEqual({ ok: true, value: { uid: UID } });
  });

  it("reports a late pass as expired", async () => {
    expect(await verifier.verify(pass(NOW / 1000 - 1))).toEqual({ ok: false, error: { code: "expired-code" } });
  });

  it("reports anything else as invalid", async () => {
    expect(await verifier.verify("devfest:cp:entrance-main")).toEqual({ ok: false, error: { code: "invalid-code" } });
    expect(await verifier.verify(`devfest:at:${UID}.99.forged-signature-value`)).toEqual({
      ok: false,
      error: { code: "invalid-code" },
    });
  });
});
