const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trimmed and lowercased, or null when it does not look like an email. The same rule the team uses to match accounts by
 * email (the admin feature's `normalizeEmail`); it is kept here so the tickets feature, which the cadet's screens
 * import, does not pull in the admin area.
 */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}
