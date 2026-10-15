import { describe, expect, it } from "vitest";
import { StaticQrPayloadVerifier, staticPayloadFor } from "./static-qr-payload-verifier";

const verifier = new StaticQrPayloadVerifier();

describe("StaticQrPayloadVerifier", () => {
  it("reads the checkpoint out of a printed code", async () => {
    expect(await verifier.verify("devfest:cp:entrance-main")).toEqual({
      ok: true,
      value: { checkpointId: "entrance-main", source: "static" },
    });
  });

  it("round-trips the payload used to print the codes", async () => {
    expect(await verifier.verify(staticPayloadFor("lunch-day-1"))).toEqual({
      ok: true,
      value: { checkpointId: "lunch-day-1", source: "static" },
    });
  });

  it.each([
    "",
    "entrance-main",
    "https://example.com/devfest:cp:talk-1",
    "devfest:cp:",
    "devfest:cp:UPPER",
    "devfest:cp:talk 1",
    "devfest:cp:talk-1\nextra",
    "devfest:cp:../users",
    " devfest:cp:talk-1",
  ])("rejects %j as an invalid code", async (payload) => {
    expect(await verifier.verify(payload)).toEqual({ ok: false, error: { code: "invalid-code" } });
  });
});
