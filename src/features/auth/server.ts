import "server-only";

// Public API (server-only). Client code must import from "@/features/auth" instead.
export type { AuthSession } from "./domain/auth-session";
export type { SessionService } from "./domain/ports";
export { canAccess, isRole, type Role } from "./domain/roles";
export { closeSession, openSession, readSession, refreshSessionCookie } from "./domain/use-cases";
export { FirebaseSessionService } from "./data/server/firebase-session-service";
export {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from "./data/server/session-cookie";
