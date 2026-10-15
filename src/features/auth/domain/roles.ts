/**
 * The role claim. `staff` and `organizer` belong to one edition (the server checks the edition's team before
 * trusting them); `admin` is global. An organizer works the control center like an admin of that edition.
 */
export const ROLES = ["attendee", "staff", "organizer", "admin"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Roles allowed to reach a surface; admin can always reach staff surfaces. */
export function canAccess(role: Role | null, allowed: readonly Role[]): boolean {
  if (role === null) return false;
  if (role === "admin") return true;
  // An organizer reaches what an admin reaches (the guard turns a valid one into an edition admin first).
  if (role === "organizer") return allowed.includes("admin") || allowed.includes("staff") || allowed.includes("organizer");
  return allowed.includes(role);
}
