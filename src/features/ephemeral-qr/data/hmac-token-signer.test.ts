import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { HmacTokenSigner, MIN_SECRET_LENGTH } = await import("./hmac-token-signer");

const SECRET = "s".repeat(MIN_SECRET_LENGTH);

describe("HmacTokenSigner", () => {
  it("signs deterministically with a URL-safe alphabet", () => {
    const signer = new HmacTokenSigner(() => SECRET);

    expect(signer.sign("talk-1.100")).toBe(signer.sign("talk-1.100"));
    expect(signer.sign("talk-1.100")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("verifies what it signed and nothing else", () => {
    const signer = new HmacTokenSigner(() => SECRET);
    const signature = signer.sign("talk-1.100");

    expect(signer.verify("talk-1.100", signature)).toBe(true);
    expect(signer.verify("talk-1.101", signature)).toBe(false);
    expect(signer.verify("talk-1.100", `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`)).toBe(false);
  });

  it("rejects signatures of the wrong length without comparing them", () => {
    const signer = new HmacTokenSigner(() => SECRET);

    expect(signer.verify("talk-1.100", "")).toBe(false);
    expect(signer.verify("talk-1.100", "short")).toBe(false);
    expect(signer.verify("talk-1.100", `${signer.sign("talk-1.100")}extra`)).toBe(false);
  });

  it("does not verify a signature made with another secret", () => {
    const mine = new HmacTokenSigner(() => SECRET);
    const theirs = new HmacTokenSigner(() => "t".repeat(MIN_SECRET_LENGTH));

    expect(mine.verify("talk-1.100", theirs.sign("talk-1.100"))).toBe(false);
  });

  it.each([undefined, "", "too-short", "x".repeat(MIN_SECRET_LENGTH - 1)])(
    "refuses to sign or verify with a missing or weak secret (%j)",
    (secret) => {
      const signer = new HmacTokenSigner(() => secret);

      expect(() => signer.sign("talk-1.100")).toThrow("QR_SIGNING_SECRET");
      expect(() => signer.verify("talk-1.100", "x".repeat(43))).toThrow("QR_SIGNING_SECRET");
    },
  );

  it("reads the secret when it is used, not when it is created", () => {
    const config: { secret?: string } = {};
    const signer = new HmacTokenSigner(() => config.secret);

    expect(() => signer.sign("a.1")).toThrow();
    config.secret = SECRET;
    expect(() => signer.sign("a.1")).not.toThrow();
  });
});
