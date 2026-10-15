// Public API (client-safe). Server-only exports live in `./server`.
export type { AuthError, AuthErrorCode } from "./domain/auth-error";
export type { AuthSession } from "./domain/auth-session";
export { ROLES, canAccess, isRole, type Role } from "./domain/roles";
export type { IdentityProvider, SessionGateway, SignInStart } from "./domain/ports";
export { completeSignIn, refreshSession, signInWithGoogle, signOut, type SignInStatus } from "./domain/use-cases";
export { FirebaseIdentityProvider } from "./data/firebase-identity-provider";
export { HttpSessionGateway } from "./data/http-session-gateway";
export { SESSION_COOKIE_NAME } from "./constants";
export { AuthActionsProvider, useAuthActions, type AuthActions } from "./ui/auth-context";
export { SignInPanel } from "./ui/SignInPanel";
export { SignOutButton } from "./ui/SignOutButton";
export { useGoogleSignIn, useSignOut, type AuthFlowState, type AuthFlowStatus } from "./ui/use-auth-flow";
