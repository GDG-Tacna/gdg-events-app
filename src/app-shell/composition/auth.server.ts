import "server-only";
import { FirebaseSessionService, type SessionService } from "@/features/auth/server";

const sessions: SessionService = new FirebaseSessionService();

/** Composition root for server-side auth: the only place that binds the Firebase adapter. */
export const authDeps = { sessions };
