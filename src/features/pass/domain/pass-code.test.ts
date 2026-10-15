import { describe, expect, it } from "vitest";
import {
  PASS_LIFETIME_SECONDS,
  PASS_MAX_FUTURE_SECONDS,
  formatPassPayload,
  parsePassPayload,
  passSigningInput,
} from "./pass-code";

const SIGNATURE = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
const UID = "kJ3x9QmZp0aBcD1eFgHiJkLmNoP2";

describe("pass payload format", () => {
  it("round-trips an attendee, an expiry and a signature", () => {
    const payload = formatPassPayload(UID, 1_792_000_000, SIGNATURE);

    expect(payload).toBe(`devfest:at:${UID}.1792000000.${SIGNATURE}`);
    expect(parsePassPayload(payload)).toEqual({ uid: UID, expiresAt: 1_792_000_000, signature: SIGNATURE });
  });

  it("signs the attendee and the expiry together under a prefix that no other code uses", () => {
    expect(passSigningInput(UID, 100)).toBe(`pass:${UID}.100`);
    expect(passSigningInput(UID, 101)).not.toBe(passSigningInput(UID, 100));
    expect(passSigningInput("otherUid123", 100)).not.toBe(passSigningInput(UID, 100));
    // A talk code signs "<checkpoint>.<expiry>": it can never equal a pass text, whatever the ids are.
    expect(passSigningInput("talk-keynote", 100)).not.toBe("talk-keynote.100");
  });

  it.each([
    ["", "empty"],
    ["devfest:cp:entrance-main", "a printed code"],
    [`devfest:eq:talk-1.100.${SIGNATURE}`, "a talk code"],
    [`devfest:at:${UID}.100`, "no signature"],
    [`devfest:at:${UID}.100.${SIGNATURE}.extra`, "an extra part"],
    [`devfest:at:ab.100.${SIGNATURE}`, "a uid that is too short"],
    [`devfest:at:${"a".repeat(129)}.100.${SIGNATURE}`, "a uid that is too long"],
    [`devfest:at:../users/${UID}.100.${SIGNATURE}`, "a path-like uid"],
    [`devfest:at:${UID}.abc.${SIGNATURE}`, "a non-numeric expiry"],
    [`devfest:at:${UID}.-5.${SIGNATURE}`, "a negative expiry"],
    [`devfest:at:${UID}.${"9".repeat(13)}.${SIGNATURE}`, "an absurdly long expiry"],
    [`devfest:at:${UID}.100.short`, "a signature that is too short"],
    [`devfest:at:${UID}.100.has spaces in it here!!`, "a signature with illegal characters"],
    [` devfest:at:${UID}.100.${SIGNATURE}`, "a leading space"],
  ])("rejects %j (%s) before any signature is checked", (payload) => {
    expect(parsePassPayload(payload)).toBeNull();
  });
});

describe("pass lifetime", () => {
  it("lasts a minute, with a little slack for clocks", () => {
    expect(PASS_LIFETIME_SECONDS).toBe(60);
    expect(PASS_MAX_FUTURE_SECONDS - PASS_LIFETIME_SECONDS).toBeLessThanOrEqual(60);
    expect(PASS_MAX_FUTURE_SECONDS).toBeGreaterThan(PASS_LIFETIME_SECONDS);
  });
});
