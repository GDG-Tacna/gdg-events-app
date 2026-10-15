/** Roles an admin can give or take away. `attendee` is not managed here: it is granted by registering. */
export const MANAGED_ROLES = ["staff", "organizer", "admin"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const isManagedRole = (value: unknown): value is ManagedRole =>
  typeof value === "string" && (MANAGED_ROLES as readonly string[]).includes(value);

/** Roles that belong to one edition: a new edition starts without them. Admins are global. */
export const EDITION_ROLES = ["staff", "organizer"] as const;
export type EditionRole = (typeof EDITION_ROLES)[number];

export const isEditionRole = (value: unknown): value is EditionRole =>
  typeof value === "string" && (EDITION_ROLES as readonly string[]).includes(value);

/** A person with a privileged role: an admin (global) or staff and organizers of the active edition. */
export interface TeamMember {
  uid: string;
  email: string;
  displayName: string | null;
  role: ManagedRole;
}

/** A signed-in account found by email. It may have no role yet. */
export interface Account {
  uid: string;
  email: string;
  displayName: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed and lowercased, or null when it does not look like an email. Emails are matched case-insensitively. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}
