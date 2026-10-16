import "server-only";
import { FirestoreAvatarStore, type AvatarDeps } from "@/features/avatar/server";

/** Composition root for avatars: one global look per person (`avatars/{uid}`). */
export const avatarDeps: AvatarDeps = {
  store: new FirestoreAvatarStore(),
  now: () => new Date(),
};
