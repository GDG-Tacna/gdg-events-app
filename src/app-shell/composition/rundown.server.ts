import "server-only";
import { FirestoreRundownStore, type RundownDeps } from "@/features/rundown/server";

/** Composition root for the stage console's running order: the paths of the files of each point of the agenda. */
export const rundownDeps: RundownDeps = { store: new FirestoreRundownStore() };
