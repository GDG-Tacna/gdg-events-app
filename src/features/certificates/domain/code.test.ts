import { describe, expect, it } from "vitest";
import { CERTIFICATE_CODE_ALPHABET, generateCertificateCode, isValidCertificateCode, normalizeCertificateCode } from "./code";

describe("certificate code", () => {
  it("generates a formatted GDG-XXXXX-XXXXX code using the unambiguous alphabet", () => {
    const code = generateCertificateCode(() => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toMatch(/^GDG-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    expect(code).toBe("GDG-23456-789AB");
    expect(CERTIFICATE_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("normalizes case, spaces, optional hyphens and optional prefix", () => {
    expect(normalizeCertificateCode("gdg-4k9p7-x2m8r")).toBe("GDG-4K9P7-X2M8R");
    expect(normalizeCertificateCode("  GDG 4K9P7 X2M8R  ")).toBe("GDG-4K9P7-X2M8R");
    expect(normalizeCertificateCode("4k9p7x2m8r")).toBe("GDG-4K9P7-X2M8R");
    expect(isValidCertificateCode("GDG4K9P7X2M8R")).toBe(true);
  });

  it("rejects ambiguous symbols, wrong lengths and garbage", () => {
    expect(normalizeCertificateCode("GDG-00000-11111")).toBeNull();
    expect(normalizeCertificateCode("GDG-OOOOO-IIIII")).toBeNull();
    expect(normalizeCertificateCode("GDG-4K9P7")).toBeNull();
    expect(normalizeCertificateCode("not-a-code")).toBeNull();
    expect(isValidCertificateCode("")).toBe(false);
  });
});
