import "server-only";

// Public API (server-only). Client code must import from "@/features/avatar" instead.
export { getAvatarLook, resetAvatarLook, saveAvatarLook, type AvatarDeps, type AvatarErrorCode, type AvatarStore } from "./domain/avatar";
export { FirestoreAvatarStore } from "./data/server/firestore-avatar-store";
