/**
 * Unambiguous uppercase alphabet (excludes 0/O and 1/I/L so a printed or shared code is never misread).
 * 10 random symbols yield 31^10 ≈ 8.2 × 10^14 distinct codes: impossible to guess or enumerate.
 */
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CERTIFICATE_CODE_PREFIX = "GDG";
const CODE_BODY_LENGTH = 10;
const CANONICAL_BODY = new RegExp(`^[${CERTIFICATE_CODE_ALPHABET}]{${CODE_BODY_LENGTH}}$`);

/** Generates a formatted verification code like `GDG-4K9P7-X2M8R` from 10 cryptographically random bytes. */
export function generateCertificateCode(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(CODE_BODY_LENGTH);
  let body = "";
  for (let index = 0; index < CODE_BODY_LENGTH; index += 1) {
    body += CERTIFICATE_CODE_ALPHABET[bytes[index] % CERTIFICATE_CODE_ALPHABET.length];
  }
  return formatCertificateCode(body);
}

/** Formats a validated 10-character body into `GDG-XXXXX-XXXXX`. */
export function formatCertificateCode(body: string): string {
  return `${CERTIFICATE_CODE_PREFIX}-${body.slice(0, 5)}-${body.slice(5, 10)}`;
}

/**
 * Accepts a code typed or pasted by a person (`gdg-4k9p7-x2m8r`, `GDG4K9P7X2M8R`, `4K9P7-X2M8R`)
 * and returns its canonical `GDG-XXXXX-XXXXX` form, or `null` when it is not a valid code.
 */
export function normalizeCertificateCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, "");
  const body = cleaned.startsWith(CERTIFICATE_CODE_PREFIX) && cleaned.length === CERTIFICATE_CODE_PREFIX.length + CODE_BODY_LENGTH
    ? cleaned.slice(CERTIFICATE_CODE_PREFIX.length)
    : cleaned;
  if (!CANONICAL_BODY.test(body)) return null;
  return formatCertificateCode(body);
}

export const isValidCertificateCode = (raw: string): boolean => normalizeCertificateCode(raw) !== null;
