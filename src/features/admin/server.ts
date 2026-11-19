import "server-only";

// Public API (server-only). Client code must import from "@/features/admin" instead.
export { EDITION_ROLES, isEditionRole, type Account, type EditionRole, type ManagedRole, type TeamMember } from "./domain/team";
export type { AuditEntry, AuditLog, CadetProfiles, RoleDirectory, TeamRepository } from "./domain/ports";
export { grantRole, listTeam, revokeRole, type Actor, type TeamDeps } from "./domain/use-cases";
export { FirebaseRoleDirectory } from "./data/server/firebase-role-directory";
export { FirestoreAuditLog } from "./data/server/firestore-audit-log";
export { FirestoreCadetProfiles } from "./data/server/firestore-cadet-profiles";
export { FirestoreTeamRepository } from "./data/server/firestore-team-repository";
export { FirestoreInviteStore } from "./data/server/firestore-invite-store";
export { ResendInviteMailer, inviteEmail } from "./data/server/resend-invite-mailer";
export * from "./domain/invites";
