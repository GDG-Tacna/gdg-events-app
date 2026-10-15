import "server-only";
import { randomInt } from "node:crypto";
import {
  CachedSquadCatalog,
  FirestoreSquadRepository,
  FirestoreSquadStore,
  createRandomPicker,
  type AssignSquadDeps,
} from "@/features/squads/server";
import { ConsoleAnalytics } from "@/shared/lib/analytics/console-analytics";
import { perEdition } from "./per-edition";

/** The squads of the active edition, as admins maintain them. The admin screens use it directly (always fresh). */
export const squadStore = new FirestoreSquadStore();

/** What attendees read: the same squads, kept for a minute. Admin changes invalidate it on this server instance. */
export const squadCatalog = perEdition(() => new CachedSquadCatalog(squadStore));

/** Composition root for the squads feature. `crypto.randomInt` keeps the draw unbiased. */
export const squadDeps: AssignSquadDeps = {
  squads: new FirestoreSquadRepository(),
  catalog: squadCatalog,
  analytics: new ConsoleAnalytics(),
  pick: createRandomPicker(randomInt),
};
