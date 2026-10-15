import { describe, expect, it } from "vitest";
import { QR_LIFETIME_SECONDS, QR_MAX_FUTURE_SECONDS, formatPayload, parsePayload, signingInput } from "./qr-code";

const SIGNATURE = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";

describe("payload format", () => {
  it("round-trips a checkpoint, an expiry and a signature", () => {
    const payload = formatPayload("talk-keynote", 1_792_000_000, SIGNATURE);

    expect(payload).toBe(`devfest:eq:talk-keynote.1792000000.${SIGNATURE}`);
    expect(parsePayload(payload)).toEqual({ checkpointId: "talk-keynote", expiresAt: 1_792_000_000, signature: SIGNATURE });
  });

  it("signs the checkpoint and the expiry together, so neither can be swapped", () => {
    expect(signingInput("talk-1", 100)).toBe("talk-1.100");
    expect(signingInput("talk-1", 101)).not.toBe(signingInput("talk-1", 100));
    expect(signingInput("talk-2", 100)).not.toBe(signingInput("talk-1", 100));
  });

  it.each([
    ["", "empty"],
    ["devfest:cp:talk-1", "a printed code"],
    [`devfest:eq:talk-1.100`, "no signature"],
    [`devfest:eq:talk-1.100.${SIGNATURE}.extra`, "an extra part"],
    [`devfest:eq:Talk 1.100.${SIGNATURE}`, "a malformed checkpoint id"],
    [`devfest:eq:../users.100.${SIGNATURE}`, "a path-like checkpoint id"],
    [`devfest:eq:talk-1.abc.${SIGNATURE}`, "a non-numeric expiry"],
    [`devfest:eq:talk-1.-5.${SIGNATURE}`, "a negative expiry"],
    [`devfest:eq:talk-1.1e9.${SIGNATURE}`, "a scientific-notation expiry"],
    [`devfest:eq:talk-1.${"9".repeat(13)}.${SIGNATURE}`, "an absurdly long expiry"],
    ["devfest:eq:talk-1.100.short", "a signature that is too short"],
    [`devfest:eq:talk-1.100.${"a".repeat(129)}`, "a signature that is too long"],
    ["devfest:eq:talk-1.100.has spaces in it here!!", "a signature with illegal characters"],
    [` devfest:eq:talk-1.100.${SIGNATURE}`, "a leading space"],
  ])("rejects %j (%s) before any signature is checked", (payload) => {
    expect(parsePayload(payload)).toBeNull();
  });
});

describe("lifetime", () => {
  it("lasts two minutes, and a code may not claim to outlive a fresh one by more than a little slack", () => {
    expect(QR_LIFETIME_SECONDS).toBe(120);
    expect(QR_MAX_FUTURE_SECONDS).toBeGreaterThan(QR_LIFETIME_SECONDS);
    expect(QR_MAX_FUTURE_SECONDS - QR_LIFETIME_SECONDS).toBeLessThanOrEqual(60);
  });
});
