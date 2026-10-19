import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => { throw new Error("no request"); } }));
vi.mock("@/shared/config/env.server", () => ({ getServerEnv: () => ({ qrSigningSecret: "x".repeat(32) }) }));

const { readWorkingEdition, signWorkingEdition, verifyWorkingEdition, workingEditionKey } = await import("./working-edition.server");

const KEY = workingEditionKey("a-secret-of-at-least-thirty-two-chars")!;
const NOW = Date.UTC(2026, 9, 14, 12);
const LATER = NOW + 60 * 60 * 1000;

describe("working edition cookie", () => {
  it("names the edition only for the account it was signed for, until it expires", () => {
    const value = signWorkingEdition(KEY, "u1", "meetup-nov", LATER);

    expect(verifyWorkingEdition(KEY, value, "u1", NOW)).toBe("meetup-nov");
    expect(verifyWorkingEdition(KEY, value, "u2", NOW)).toBeNull();
    expect(verifyWorkingEdition(KEY, value, "u1", LATER + 1000)).toBeNull();
  });

  it("refuses a value changed by hand or signed with another key", () => {
    const value = signWorkingEdition(KEY, "u1", "meetup-nov", LATER);
    const [, expires, signature] = value.split(".");

    expect(verifyWorkingEdition(KEY, `devfest-2026.${expires}.${signature}`, "u1", NOW)).toBeNull();
    expect(verifyWorkingEdition(KEY, `meetup-nov.${Number(expires) + 9999}.${signature}`, "u1", NOW)).toBeNull();
    expect(verifyWorkingEdition(workingEditionKey("another-secret-of-thirty-two-characters")!, value, "u1", NOW)).toBeNull();
    expect(verifyWorkingEdition(KEY, "garbage", "u1", NOW)).toBeNull();
    expect(verifyWorkingEdition(KEY, undefined, "u1", NOW)).toBeNull();
  });

  it("has no key without a QR secret, and no working edition outside a request", async () => {
    expect(workingEditionKey("")).toBeNull();
    expect(workingEditionKey("too-short-for-the-qr-codes")).toBeNull();
    expect(await readWorkingEdition("u1")).toBeNull();
  });
});
